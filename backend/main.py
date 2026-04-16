import asyncio
import io
import json
import logging
import math
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from collections import defaultdict
from typing import List, Optional

import yaml
from fastapi import Depends, FastAPI, HTTPException, Query, UploadFile

from backup.backup import run_backup_once
from backup.scheduler import backup_loop
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    create_engine,
    inspect,
    nullslast,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

PROJECT_CONFIG_PATH = Path(__file__).parent.parent / "project_config.yaml"
with open(PROJECT_CONFIG_PATH, encoding="utf-8") as _f:
    PROJECT_CONFIG = yaml.safe_load(_f) or {}

_openai_key = (PROJECT_CONFIG.get("keys") or {}).get("openai_key", "")
openai_client: Optional[OpenAI] = OpenAI(api_key=_openai_key) if _openai_key else None

# ─── User settings (persisted, shared with frontend) ─────────────────────────

USER_SETTINGS_PATH = Path(__file__).parent / "user_settings.json"

DEFAULT_USER_SETTINGS: dict = {
    "timezone": None,
    "theme": "light",
    "meeting_note_sort": "updated_at",
    "todo_defaults": {
        "assignee_name": "",
        "deadline_to_today": False,
        "estimated_hours": "1",
        "importance": "medium",
    },
    "hotkeys": {},
}


def _load_user_settings() -> dict:
    try:
        with open(USER_SETTINGS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {}


def _save_user_settings(data: dict) -> None:
    tmp = USER_SETTINGS_PATH.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    tmp.replace(USER_SETTINGS_PATH)


def _merged_user_settings() -> dict:
    """Return stored settings merged on top of DEFAULT_USER_SETTINGS (deep merge todo_defaults)."""
    stored = _load_user_settings()
    merged = {**DEFAULT_USER_SETTINGS, **{k: v for k, v in stored.items() if v is not None or k == "timezone"}}
    merged["todo_defaults"] = {
        **DEFAULT_USER_SETTINGS["todo_defaults"],
        **(stored.get("todo_defaults") or {}),
    }
    merged["hotkeys"] = {**(stored.get("hotkeys") or {})}
    return merged


def get_user_timezone() -> str:
    """Return the user's preferred IANA timezone, falling back to system local."""
    tz = _load_user_settings().get("timezone")
    if tz:
        return tz
    try:
        return datetime.now().astimezone().tzinfo.key  # type: ignore[attr-defined]
    except Exception:
        return "UTC"

MEETING_NOTES_DIR = Path(__file__).parent / "meeting_notes"
MEETING_TEMPLATES_DIR = Path(__file__).parent / "meeting_templates"
MEETING_AUDIO_DIR = Path(__file__).parent / "meeting_audio"
MEETING_TRANSCRIPTS_DIR = Path(__file__).parent / "meeting_transcripts"
MEETING_NOTES_DIR.mkdir(exist_ok=True)
MEETING_TEMPLATES_DIR.mkdir(exist_ok=True)
MEETING_AUDIO_DIR.mkdir(exist_ok=True)
MEETING_TRANSCRIPTS_DIR.mkdir(exist_ok=True)

DATABASE_URL = "sqlite:///./management.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# Many-to-many: todo blocked_by other todos
todo_blockers = Table(
    "todo_blockers",
    Base.metadata,
    Column("todo_id", Integer, ForeignKey("todos.id"), primary_key=True),
    Column("blocker_id", Integer, ForeignKey("todos.id"), primary_key=True),
)


# Many-to-many: meeting notes associations
meeting_note_attendees = Table(
    "meeting_note_attendees",
    Base.metadata,
    Column(
        "meeting_note_id", Integer, ForeignKey("meeting_notes.id"), primary_key=True
    ),
    Column("person_id", Integer, ForeignKey("persons.id"), primary_key=True),
)

meeting_note_projects = Table(
    "meeting_note_projects",
    Base.metadata,
    Column(
        "meeting_note_id", Integer, ForeignKey("meeting_notes.id"), primary_key=True
    ),
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
)

meeting_note_todos = Table(
    "meeting_note_todos",
    Base.metadata,
    Column(
        "meeting_note_id", Integer, ForeignKey("meeting_notes.id"), primary_key=True
    ),
    Column("todo_id", Integer, ForeignKey("todos.id"), primary_key=True),
)


class Person(Base):
    __tablename__ = "persons"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    todos = relationship("Todo", back_populates="assignee")


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    parent_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    deadline = Column(String, nullable=True)
    deleted_at = Column(String, nullable=True)
    subprojects = relationship(
        "Project", back_populates="parent", cascade="all, delete-orphan"
    )
    parent = relationship("Project", back_populates="subprojects", remote_side=[id])
    todos = relationship("Todo", back_populates="project")


class Todo(Base):
    __tablename__ = "todos"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    assignee_id = Column(Integer, ForeignKey("persons.id"), nullable=True)
    deadline = Column(String, nullable=True)
    importance = Column(String, default="medium")
    estimated_hours = Column(Float, default=1.0)
    status = Column(String, default="todo")
    is_focused = Column(Boolean, default=False)
    focus_order = Column(Integer, default=0)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    done_at = Column(String, nullable=True)
    deleted_at = Column(String, nullable=True)
    subtodos = relationship(
        "SubTodo",
        back_populates="todo",
        cascade="all, delete-orphan",
        order_by="SubTodo.order",
    )
    project = relationship("Project", back_populates="todos")
    assignee = relationship("Person", back_populates="todos")
    blocked_by = relationship(
        "Todo",
        secondary=todo_blockers,
        primaryjoin=id == todo_blockers.c.todo_id,
        secondaryjoin=id == todo_blockers.c.blocker_id,
        backref="blocking",
    )


class SubTodo(Base):
    __tablename__ = "subtodos"
    id = Column(Integer, primary_key=True, index=True)
    todo_id = Column(Integer, ForeignKey("todos.id"), nullable=False)
    title = Column(String, nullable=False)
    done = Column(Boolean, default=False)
    order = Column(Integer, default=0)
    todo = relationship("Todo", back_populates="subtodos")


class MustDoItem(Base):
    __tablename__ = "must_do_items"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    todo_id = Column(Integer, ForeignKey("todos.id"), nullable=True)
    text = Column(String, nullable=False)
    done = Column(Boolean, default=False)
    order = Column(Integer, default=0)
    section = Column(String, default="morning")  # morning | afternoon | evening
    todo = relationship("Todo")


class DailyGoal(Base):
    __tablename__ = "daily_goals"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False, unique=True)  # YYYY-MM-DD
    content = Column(Text, default="")
    updated_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())


class MeetingNote(Base):
    __tablename__ = "meeting_notes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    filename = Column(String, nullable=False, unique=True)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    updated_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    hidden = Column(Boolean, default=False)
    attendees = relationship("Person", secondary=meeting_note_attendees)
    projects = relationship("Project", secondary=meeting_note_projects)
    todos = relationship("Todo", secondary=meeting_note_todos)


Base.metadata.create_all(bind=engine)

# Migrate: add section column to must_do_items if missing
with engine.connect() as _conn:
    _insp = inspect(engine)
    _cols = [c["name"] for c in _insp.get_columns("must_do_items")]
    if "section" not in _cols:
        _conn.execute(text("ALTER TABLE must_do_items ADD COLUMN section TEXT DEFAULT 'morning'"))
        _conn.commit()
    for _tbl in ("todos", "projects"):
        _tbl_cols = [c["name"] for c in _insp.get_columns(_tbl)]
        if "deleted_at" not in _tbl_cols:
            _conn.execute(text(f"ALTER TABLE {_tbl} ADD COLUMN deleted_at TEXT"))
            _conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Pydantic Schemas ────────────────────────────────────────────────────────


class PersonCreate(BaseModel):
    name: str
    email: Optional[str] = None


class PersonOut(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None
    deleted_at: Optional[str] = None
    model_config = {"from_attributes": True}


class ProjectTreeOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None
    subprojects: List["ProjectTreeOut"] = []
    model_config = {"from_attributes": True}


ProjectTreeOut.model_rebuild()


class SubTodoCreate(BaseModel):
    title: str
    done: bool = False
    order: int = 0


class SubTodoUpdate(BaseModel):
    title: Optional[str] = None
    done: Optional[bool] = None
    order: Optional[int] = None


class SubTodoOut(BaseModel):
    id: int
    title: str
    done: bool
    order: int
    model_config = {"from_attributes": True}


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None
    deadline: Optional[str] = None
    importance: str = "medium"
    estimated_hours: float = 1.0
    status: str = "todo"
    is_focused: bool = False
    blocked_by_ids: List[int] = []


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None
    deadline: Optional[str] = None
    importance: Optional[str] = None
    estimated_hours: Optional[float] = None
    status: Optional[str] = None
    is_focused: Optional[bool] = None
    focus_order: Optional[int] = None
    blocked_by_ids: Optional[List[int]] = None


class TodoOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    deadline: Optional[str] = None
    importance: str
    estimated_hours: float
    status: str
    is_blocked: bool
    is_focused: bool
    focus_order: int
    created_at: str
    done_at: Optional[str] = None
    deleted_at: Optional[str] = None
    subtodos: List[SubTodoOut] = []
    blocked_by_ids: List[int] = []
    model_config = {"from_attributes": True}


class ScheduleStatus(BaseModel):
    todo_id: int
    title: str
    assignee_name: str
    deadline: str
    estimated_hours: float
    available_hours: float
    chain_hours: float  # estimated_hours + longest pending-blocker chain
    status: str  # 'behind' | 'warning'


class MustDoItemCreate(BaseModel):
    todo_id: Optional[int] = None
    text: str
    done: bool = False
    order: int = 0
    section: str = "morning"


class MustDoItemUpdate(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None
    order: Optional[int] = None
    section: Optional[str] = None
    todo_id: Optional[int] = None


class MustDoItemOut(BaseModel):
    id: int
    date: str
    todo_id: Optional[int] = None
    text: str
    done: bool
    order: int
    section: str = "morning"
    model_config = {"from_attributes": True}


class DailyGoalUpdate(BaseModel):
    content: str


class DailyGoalOut(BaseModel):
    id: int
    date: str
    content: str
    updated_at: str
    model_config = {"from_attributes": True}


class PersonProgressBucket(BaseModel):
    period: str
    task_count: int
    total_hours: float


class PersonProgress(BaseModel):
    person_id: int
    person_name: str
    buckets: List[PersonProgressBucket]
    total_task_count: int
    total_hours: float


class MeetingNoteCreate(BaseModel):
    title: str
    date: str
    content: str = ""
    attendee_ids: List[int] = []
    project_ids: List[int] = []
    todo_ids: List[int] = []
    template: Optional[str] = None


class MeetingNoteUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    content: Optional[str] = None
    attendee_ids: Optional[List[int]] = None
    project_ids: Optional[List[int]] = None
    todo_ids: Optional[List[int]] = None
    transcript: Optional[str] = None


class AudioFileInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: str


class MeetingNoteOut(BaseModel):
    id: int
    title: str
    date: str
    filename: str
    content: str
    created_at: str
    updated_at: str
    attendee_ids: List[int] = []
    attendee_names: List[str] = []
    project_ids: List[int] = []
    project_names: List[str] = []
    todo_ids: List[int] = []
    todo_titles: List[str] = []
    transcript: Optional[str] = None
    audio_files: List[AudioFileInfo] = []
    model_config = {"from_attributes": True}


class MeetingNoteSummary(BaseModel):
    id: int
    title: str
    date: str
    created_at: str
    updated_at: str
    attendee_names: List[str] = []
    project_names: List[str] = []
    todo_count: int = 0
    model_config = {"from_attributes": True}


class MeetingTemplateOut(BaseModel):
    name: str
    content: str


class MeetingNoteSearchResult(BaseModel):
    id: int
    title: str
    date: str
    snippet: str


# ─── Helpers ─────────────────────────────────────────────────────────────────


def todo_to_out(t: Todo) -> TodoOut:
    return TodoOut(
        id=t.id,
        title=t.title,
        description=t.description,
        project_id=t.project_id,
        project_name=t.project.name if t.project and t.project.deleted_at is None else None,
        assignee_id=t.assignee_id,
        assignee_name=t.assignee.name if t.assignee else None,
        deadline=t.deadline,
        importance=t.importance,
        estimated_hours=t.estimated_hours,
        status=t.status,
        is_blocked=any(b.status != "done" and b.deleted_at is None for b in t.blocked_by),
        is_focused=t.is_focused or False,
        focus_order=t.focus_order or 0,
        created_at=t.created_at,
        done_at=t.done_at,
        deleted_at=t.deleted_at,
        subtodos=[SubTodoOut.model_validate(s) for s in t.subtodos],
        blocked_by_ids=[b.id for b in t.blocked_by],
    )


def project_to_tree(p: Project) -> ProjectTreeOut:
    return ProjectTreeOut(
        id=p.id,
        name=p.name,
        description=p.description,
        notes=p.notes,
        parent_id=p.parent_id,
        deadline=p.deadline,
        subprojects=[
            project_to_tree(sp) for sp in p.subprojects if sp.deleted_at is None
        ],
    )


def _read_note_content(filename: str) -> str:
    path = MEETING_NOTES_DIR / filename
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def _write_note_content(filename: str, content: str) -> None:
    path = MEETING_NOTES_DIR / filename
    path.write_text(content, encoding="utf-8")


def _read_transcript(note_id: int) -> Optional[str]:
    path = MEETING_TRANSCRIPTS_DIR / f"{note_id}.txt"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def _write_transcript(note_id: int, content: str) -> None:
    path = MEETING_TRANSCRIPTS_DIR / f"{note_id}.txt"
    path.write_text(content, encoding="utf-8")


def _list_audio_files(note_id: int) -> List[AudioFileInfo]:
    audio_dir = MEETING_AUDIO_DIR / str(note_id)
    if not audio_dir.exists():
        return []
    files = []
    for f in sorted(audio_dir.iterdir()):
        if f.is_file():
            stat = f.stat()
            files.append(
                AudioFileInfo(
                    filename=f.name,
                    size_bytes=stat.st_size,
                    created_at=datetime.fromtimestamp(
                        stat.st_ctime, tz=timezone.utc
                    ).isoformat(),
                )
            )
    return files


def meeting_note_to_out(n: MeetingNote) -> MeetingNoteOut:
    return MeetingNoteOut(
        id=n.id,
        title=n.title,
        date=n.date,
        filename=n.filename,
        content=_read_note_content(n.filename),
        created_at=n.created_at,
        updated_at=n.updated_at,
        attendee_ids=[p.id for p in n.attendees],
        attendee_names=[p.name for p in n.attendees],
        project_ids=[p.id for p in n.projects],
        project_names=[p.name for p in n.projects],
        todo_ids=[t.id for t in n.todos],
        todo_titles=[t.title for t in n.todos],
        transcript=_read_transcript(n.id),
        audio_files=_list_audio_files(n.id),
    )


def meeting_note_to_summary(n: MeetingNote) -> MeetingNoteSummary:
    return MeetingNoteSummary(
        id=n.id,
        title=n.title,
        date=n.date,
        created_at=n.created_at,
        updated_at=n.updated_at,
        attendee_names=[p.name for p in n.attendees],
        project_names=[p.name for p in n.projects],
        todo_count=len(n.todos),
    )


# ─── App ─────────────────────────────────────────────────────────────────────

log = logging.getLogger("management")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(backup_loop(get_user_timezone))
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(title="Management API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Persons ─────────────────────────────────────────────────────────────────


@app.get("/persons", response_model=List[PersonOut])
def list_persons(db: Session = Depends(get_db)):
    return db.query(Person).all()


@app.post("/persons", response_model=PersonOut)
def create_person(data: PersonCreate, db: Session = Depends(get_db)):
    p = Person(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.delete("/persons/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db)):
    p = db.query(Person).get(person_id)
    if not p:
        raise HTTPException(404, "Person not found")
    db.delete(p)
    db.commit()
    return {"ok": True}


@app.get("/persons/progress", response_model=List[PersonProgress])
def person_progress(
    granularity: str = Query("week", pattern="^(day|week|month)$"),
    since: Optional[str] = Query(None),
    tz: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    from zoneinfo import ZoneInfo
    local_tz = None
    if tz:
        try:
            local_tz = ZoneInfo(tz)
        except (KeyError, ValueError):
            pass

    if since is None:
        from datetime import timedelta
        days_back = {"day": 90, "week": 180, "month": 365}[granularity]
        since = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")

    todos = (
        db.query(Todo)
        .filter(
            Todo.status == "done",
            Todo.assignee_id != None,
            Todo.done_at != None,
            Todo.done_at >= since,
            Todo.deleted_at == None,
        )
        .all()
    )
    persons_map = {p.id: p.name for p in db.query(Person).all()}

    data: dict = defaultdict(lambda: defaultdict(lambda: {"count": 0, "hours": 0.0}))
    for t in todos:
        try:
            dt = datetime.fromisoformat(t.done_at)
        except (ValueError, TypeError):
            continue
        if local_tz:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(local_tz)
        if granularity == "day":
            key = dt.strftime("%Y-%m-%d")
        elif granularity == "week":
            iso = dt.isocalendar()
            key = f"{iso[0]}-W{iso[1]:02d}"
        else:
            key = dt.strftime("%Y-%m")
        data[t.assignee_id][key]["count"] += 1
        data[t.assignee_id][key]["hours"] += t.estimated_hours

    result = []
    for pid, buckets in data.items():
        sorted_buckets = sorted(buckets.items())
        result.append(PersonProgress(
            person_id=pid,
            person_name=persons_map.get(pid, "Unknown"),
            buckets=[
                PersonProgressBucket(period=k, task_count=v["count"], total_hours=v["hours"])
                for k, v in sorted_buckets
            ],
            total_task_count=sum(v["count"] for v in buckets.values()),
            total_hours=sum(v["hours"] for v in buckets.values()),
        ))
    return sorted(result, key=lambda r: r.person_name)


# ─── Projects ────────────────────────────────────────────────────────────────


@app.get("/projects", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).filter(Project.deleted_at == None).all()


@app.get("/projects/tree", response_model=List[ProjectTreeOut])
def projects_tree(db: Session = Depends(get_db)):
    roots = (
        db.query(Project)
        .filter(Project.parent_id == None, Project.deleted_at == None)
        .all()
    )
    return [project_to_tree(r) for r in roots]


@app.post("/projects", response_model=ProjectOut)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    p = Project(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


def _cascade_soft_delete_project(p: Project, ts: str) -> None:
    if p.deleted_at is None:
        p.deleted_at = ts
    for child in p.subprojects:
        if child.deleted_at is None:
            _cascade_soft_delete_project(child, ts)


def _cascade_restore_project(p: Project) -> None:
    p.deleted_at = None
    for child in p.subprojects:
        if child.deleted_at is not None:
            _cascade_restore_project(child)


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    _cascade_soft_delete_project(p, datetime.now(timezone.utc).isoformat())
    db.commit()
    return {"ok": True}


@app.post("/projects/{project_id}/restore")
def restore_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    _cascade_restore_project(p)
    db.commit()
    return {"ok": True}


@app.delete("/projects/{project_id}/purge")
def purge_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if p.deleted_at is None:
        raise HTTPException(400, "Project is not soft-deleted")
    db.delete(p)
    db.commit()
    return {"ok": True}


@app.get("/projects/deleted", response_model=List[ProjectOut])
def list_deleted_projects(db: Session = Depends(get_db)):
    return (
        db.query(Project)
        .filter(Project.deleted_at != None)
        .order_by(Project.deleted_at.desc())
        .all()
    )


# ─── Todos ───────────────────────────────────────────────────────────────────


@app.get("/todos", response_model=List[TodoOut])
def list_todos(
    assignee_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    exclude_done: bool = Query(False),
    is_focused: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Todo).filter(Todo.deleted_at == None)
    if assignee_id is not None:
        q = q.filter(Todo.assignee_id == assignee_id)
    if project_id is not None:
        q = q.filter(Todo.project_id == project_id)
    if is_focused is not None:
        q = q.filter(Todo.is_focused == is_focused)
    if exclude_done:
        q = q.filter(Todo.status != "done")
    if status == "blocked":
        todos = [
            t for t in q.all()
            if any(b.status != "done" and b.deleted_at is None for b in t.blocked_by)
        ]
    else:
        if status is not None:
            q = q.filter(Todo.status == status)
        todos = q.all()
    return [todo_to_out(t) for t in todos]


@app.get("/todos/recently-done", response_model=List[TodoOut])
def recently_done_todos(limit: int = Query(50), db: Session = Depends(get_db)):
    todos = (
        db.query(Todo)
        .filter(Todo.status == "done", Todo.deleted_at == None)
        .order_by(nullslast(Todo.done_at.desc()), Todo.created_at.desc())
        .limit(limit)
        .all()
    )
    return [todo_to_out(t) for t in todos]


@app.get("/todos/deleted", response_model=List[TodoOut])
def list_deleted_todos(db: Session = Depends(get_db)):
    todos = (
        db.query(Todo)
        .filter(Todo.deleted_at != None)
        .order_by(Todo.deleted_at.desc())
        .all()
    )
    return [todo_to_out(t) for t in todos]


class FocusOrderItem(BaseModel):
    id: int
    focus_order: int


@app.put("/todos/reorder-focus")
def reorder_focus(items: List[FocusOrderItem], db: Session = Depends(get_db)):
    for item in items:
        t = db.query(Todo).get(item.id)
        if t:
            t.focus_order = item.focus_order
    db.commit()
    return {"ok": True}


@app.get("/todos/{todo_id}", response_model=TodoOut)
def get_todo(todo_id: int, db: Session = Depends(get_db)):
    t = db.query(Todo).get(todo_id)
    if not t:
        raise HTTPException(404, "Todo not found")
    return todo_to_out(t)


@app.post("/todos", response_model=TodoOut)
def create_todo(data: TodoCreate, db: Session = Depends(get_db)):
    blocked_by_ids = data.blocked_by_ids
    todo_data = data.model_dump(exclude={"blocked_by_ids"})
    t = Todo(**todo_data)
    if blocked_by_ids:
        blockers = db.query(Todo).filter(Todo.id.in_(blocked_by_ids)).all()
        t.blocked_by = blockers
    db.add(t)
    db.commit()
    db.refresh(t)
    return todo_to_out(t)


@app.put("/todos/{todo_id}", response_model=TodoOut)
def update_todo(todo_id: int, data: TodoUpdate, db: Session = Depends(get_db)):
    t = db.query(Todo).get(todo_id)
    if not t:
        raise HTTPException(404, "Todo not found")
    update_data = data.model_dump(exclude_unset=True)
    blocked_by_ids = update_data.pop("blocked_by_ids", None)
    old_status = t.status
    for k, v in update_data.items():
        setattr(t, k, v)
    if "status" in update_data:
        new_status = update_data["status"]
        if new_status == "done" and old_status != "done":
            t.done_at = datetime.now(timezone.utc).isoformat()
        elif new_status != "done" and old_status == "done":
            t.done_at = None
    if blocked_by_ids is not None:
        blockers = db.query(Todo).filter(Todo.id.in_(blocked_by_ids)).all()
        t.blocked_by = blockers
    db.commit()
    db.refresh(t)
    return todo_to_out(t)


@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    t = db.query(Todo).get(todo_id)
    if not t:
        raise HTTPException(404, "Todo not found")
    t.deleted_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True}


@app.post("/todos/{todo_id}/restore")
def restore_todo(todo_id: int, db: Session = Depends(get_db)):
    t = db.query(Todo).get(todo_id)
    if not t:
        raise HTTPException(404, "Todo not found")
    t.deleted_at = None
    db.commit()
    return {"ok": True}


@app.delete("/todos/{todo_id}/purge")
def purge_todo(todo_id: int, db: Session = Depends(get_db)):
    t = db.query(Todo).get(todo_id)
    if not t:
        raise HTTPException(404, "Todo not found")
    if t.deleted_at is None:
        raise HTTPException(400, "Todo is not soft-deleted")
    db.delete(t)
    db.commit()
    return {"ok": True}


# ─── SubTodos ────────────────────────────────────────────────────────────────


@app.post("/todos/{todo_id}/subtodos", response_model=SubTodoOut)
def create_subtodo(todo_id: int, data: SubTodoCreate, db: Session = Depends(get_db)):
    t = db.query(Todo).get(todo_id)
    if not t:
        raise HTTPException(404, "Todo not found")
    s = SubTodo(todo_id=todo_id, **data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@app.put("/subtodos/{subtodo_id}", response_model=SubTodoOut)
def update_subtodo(subtodo_id: int, data: SubTodoUpdate, db: Session = Depends(get_db)):
    s = db.query(SubTodo).get(subtodo_id)
    if not s:
        raise HTTPException(404, "SubTodo not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@app.delete("/subtodos/{subtodo_id}")
def delete_subtodo(subtodo_id: int, db: Session = Depends(get_db)):
    s = db.query(SubTodo).get(subtodo_id)
    if not s:
        raise HTTPException(404, "SubTodo not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ─── Must Do Items ───────────────────────────────────────────────────────────


@app.get("/must-do/{date}", response_model=List[MustDoItemOut])
def list_must_do(date: str, db: Session = Depends(get_db)):
    items = (
        db.query(MustDoItem)
        .filter(MustDoItem.date == date)
        .order_by(MustDoItem.order)
        .all()
    )
    if items:
        return items

    # Carry over undone items from the most recent previous day
    prev = (
        db.query(MustDoItem)
        .filter(MustDoItem.date < date, MustDoItem.done == False)
        .order_by(MustDoItem.date.desc(), MustDoItem.order)
        .all()
    )
    if not prev:
        return []

    latest_date = prev[0].date
    carried = [p for p in prev if p.date == latest_date]
    for i, old in enumerate(carried):
        item = MustDoItem(
            date=date,
            todo_id=old.todo_id,
            text=old.text,
            done=False,
            order=i,
        )
        db.add(item)
    db.commit()

    return (
        db.query(MustDoItem)
        .filter(MustDoItem.date == date)
        .order_by(MustDoItem.order)
        .all()
    )


@app.post("/must-do/{date}", response_model=MustDoItemOut)
def create_must_do(date: str, data: MustDoItemCreate, db: Session = Depends(get_db)):
    item = MustDoItem(date=date, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.put("/must-do/items/{item_id}", response_model=MustDoItemOut)
def update_must_do(item_id: int, data: MustDoItemUpdate, db: Session = Depends(get_db)):
    item = db.query(MustDoItem).get(item_id)
    if not item:
        raise HTTPException(404, "Must-do item not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@app.delete("/must-do/items/{item_id}")
def delete_must_do(item_id: int, db: Session = Depends(get_db)):
    item = db.query(MustDoItem).get(item_id)
    if not item:
        raise HTTPException(404, "Must-do item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ─── Daily Goals ─────────────────────────────────────────────────────────────


@app.get("/daily-goals", response_model=List[DailyGoalOut])
def list_daily_goals(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
):
    return (
        db.query(DailyGoal)
        .filter(DailyGoal.date >= date_from, DailyGoal.date <= date_to)
        .order_by(DailyGoal.date)
        .all()
    )


@app.put("/daily-goals/{date}", response_model=DailyGoalOut)
def upsert_daily_goal(date: str, data: DailyGoalUpdate, db: Session = Depends(get_db)):
    goal = db.query(DailyGoal).filter(DailyGoal.date == date).first()
    if not goal:
        goal = DailyGoal(date=date, content=data.content, updated_at=datetime.now(timezone.utc).isoformat())
        db.add(goal)
    else:
        goal.content = data.content
        goal.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(goal)
    return goal


# ─── Schedule / Reminders ────────────────────────────────────────────────────


def _chain_hours(todo: Todo, visited: set) -> float:
    """Return todo's estimated_hours + the longest chain of pending (not-done) blockers."""
    if todo.id in visited:
        return todo.estimated_hours  # cycle guard
    visited.add(todo.id)
    pending = [b for b in todo.blocked_by if b.status != "done"]
    if not pending:
        return todo.estimated_hours
    return todo.estimated_hours + max(_chain_hours(b, visited) for b in pending)


@app.get("/schedule/reminders", response_model=List[ScheduleStatus])
def schedule_reminders(db: Session = Depends(get_db)):
    today = date.today()
    todos = (
        db.query(Todo)
        .filter(Todo.deadline != None, Todo.status != "done", Todo.deleted_at == None)
        .all()
    )
    results = []
    for t in todos:
        try:
            deadline_date = date.fromisoformat(t.deadline)
        except Exception:
            continue
        days = (deadline_date - today).days
        available = max(0.0, days * 9.0)
        chain = _chain_hours(t, set())
        if available < chain:
            status = "behind"
        elif available < chain + 9.0:
            status = "warning"
        else:
            continue
        results.append(
            ScheduleStatus(
                todo_id=t.id,
                title=t.title,
                assignee_name=t.assignee.name if t.assignee else "Unknown",
                deadline=t.deadline,
                estimated_hours=t.estimated_hours,
                available_hours=available,
                chain_hours=chain,
                status=status,
            )
        )
    results.sort(key=lambda x: (x.status == "warning", x.available_hours))
    return results


# ─── Meeting Notes ──────────────────────────────────────────────────────────


@app.get("/meeting-notes/search", response_model=List[MeetingNoteSearchResult])
def search_meeting_notes(
    q: str = Query(..., min_length=1), db: Session = Depends(get_db)
):
    q_lower = q.lower()
    results = []
    notes = (
        db.query(MeetingNote)
        .filter(MeetingNote.hidden == False)
        .order_by(MeetingNote.date.desc())
        .all()
    )
    for n in notes:
        content = _read_note_content(n.filename)
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if q_lower in line.lower():
                start = max(0, i - 1)
                end = min(len(lines), i + 2)
                snippet = "\n".join(lines[start:end])
                results.append(
                    MeetingNoteSearchResult(
                        id=n.id, title=n.title, date=n.date, snippet=snippet
                    )
                )
                break  # one match per note
        # also match title
        if q_lower in n.title.lower() and not any(r.id == n.id for r in results):
            results.append(
                MeetingNoteSearchResult(id=n.id, title=n.title, date=n.date, snippet="")
            )
    return results


@app.get("/meeting-notes", response_model=List[MeetingNoteSummary])
def list_meeting_notes(
    person_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    todo_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(MeetingNote).filter(MeetingNote.hidden == False)
    if person_id is not None:
        q = q.filter(MeetingNote.attendees.any(Person.id == person_id))
    if project_id is not None:
        q = q.filter(MeetingNote.projects.any(Project.id == project_id))
    if todo_id is not None:
        q = q.filter(MeetingNote.todos.any(Todo.id == todo_id))
    if date_from is not None:
        q = q.filter(MeetingNote.date >= date_from)
    if date_to is not None:
        q = q.filter(MeetingNote.date <= date_to)
    notes = q.order_by(MeetingNote.date.desc()).all()
    return [meeting_note_to_summary(n) for n in notes]


@app.get("/meeting-notes/{note_id}", response_model=MeetingNoteOut)
def get_meeting_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    return meeting_note_to_out(n)


@app.post("/meeting-notes", response_model=MeetingNoteOut)
def create_meeting_note(data: MeetingNoteCreate, db: Session = Depends(get_db)):
    # Determine initial content
    content = data.content
    if not content and data.template:
        tmpl_path = MEETING_TEMPLATES_DIR / f"{data.template}.md"
        if tmpl_path.exists():
            content = tmpl_path.read_text(encoding="utf-8")

    # Create DB record with placeholder filename
    n = MeetingNote(
        title=data.title,
        date=data.date,
        filename="__placeholder__",
    )
    if data.attendee_ids:
        n.attendees = db.query(Person).filter(Person.id.in_(data.attendee_ids)).all()
    if data.project_ids:
        n.projects = db.query(Project).filter(Project.id.in_(data.project_ids)).all()
    if data.todo_ids:
        n.todos = db.query(Todo).filter(Todo.id.in_(data.todo_ids)).all()
    db.add(n)
    db.flush()  # get the id

    # Generate unique filename: {id:08d}_{date}-{H:M:S}-{tz}_{uuid12}.md
    now = datetime.now(timezone.utc)
    time_part = now.strftime("%H:%M:%S")
    uid = uuid.uuid4().hex[:12]
    n.filename = f"{n.id:08d}_{data.date}-{time_part}-UTC_{uid}.md"
    _write_note_content(n.filename, content or "")
    db.commit()
    db.refresh(n)
    return meeting_note_to_out(n)


@app.put("/meeting-notes/{note_id}", response_model=MeetingNoteOut)
def update_meeting_note(
    note_id: int, data: MeetingNoteUpdate, db: Session = Depends(get_db)
):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    update_data = data.model_dump(exclude_unset=True)
    content = update_data.pop("content", None)
    attendee_ids = update_data.pop("attendee_ids", None)
    project_ids = update_data.pop("project_ids", None)
    todo_ids = update_data.pop("todo_ids", None)
    transcript = update_data.pop("transcript", None)

    for k, v in update_data.items():
        setattr(n, k, v)
    if attendee_ids is not None:
        n.attendees = db.query(Person).filter(Person.id.in_(attendee_ids)).all()
    if project_ids is not None:
        n.projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
    if todo_ids is not None:
        n.todos = db.query(Todo).filter(Todo.id.in_(todo_ids)).all()
    if content is not None:
        _write_note_content(n.filename, content)
    if transcript is not None:
        _write_transcript(n.id, transcript)

    n.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(n)
    return meeting_note_to_out(n)


@app.delete("/meeting-notes/{note_id}")
def delete_meeting_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    n.hidden = True
    n.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True}


@app.post("/meeting-notes/{note_id}/restore")
def restore_meeting_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    n.hidden = False
    n.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True}


# ─── Meeting Note Audio ────────────────────────────────────────────────────


@app.post("/meeting-notes/{note_id}/audio")
async def upload_audio(
    note_id: int, file: UploadFile, db: Session = Depends(get_db)
):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    audio_dir = MEETING_AUDIO_DIR / str(note_id)
    audio_dir.mkdir(exist_ok=True)
    # Save uploaded file to a temp location first
    tmp_name = f"{uuid.uuid4().hex}_raw"
    raw_ext = Path(file.filename or "recording.webm").suffix or ".webm"
    raw_dest = audio_dir / f"{tmp_name}{raw_ext}"
    with open(raw_dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)
    # Convert to MP3 for universal compatibility
    dest = audio_dir / f"{uuid.uuid4().hex}.mp3"
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(raw_dest)
        audio.export(str(dest), format="mp3", bitrate="128k")
    finally:
        raw_dest.unlink(missing_ok=True)
    stat = dest.stat()
    return AudioFileInfo(
        filename=dest.name,
        size_bytes=stat.st_size,
        created_at=datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
    )


@app.get(
    "/meeting-notes/{note_id}/audio", response_model=List[AudioFileInfo]
)
def list_audio(note_id: int, db: Session = Depends(get_db)):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    return _list_audio_files(note_id)


@app.delete("/meeting-notes/{note_id}/audio/{filename}")
def delete_audio(note_id: int, filename: str, db: Session = Depends(get_db)):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    path = MEETING_AUDIO_DIR / str(note_id) / filename
    if (
        not path.exists()
        or not path.resolve().is_relative_to(MEETING_AUDIO_DIR.resolve())
    ):
        raise HTTPException(404, "Audio file not found")
    path.unlink()
    # Clean up empty directory
    parent = path.parent
    if parent.exists() and not any(parent.iterdir()):
        parent.rmdir()
    return {"ok": True}


@app.get("/meeting-notes/{note_id}/audio/{filename}/download")
def download_audio(
    note_id: int, filename: str, db: Session = Depends(get_db)
):
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")
    path = MEETING_AUDIO_DIR / str(note_id) / filename
    if (
        not path.exists()
        or not path.resolve().is_relative_to(MEETING_AUDIO_DIR.resolve())
    ):
        raise HTTPException(404, "Audio file not found")
    media_type = "audio/mpeg" if path.suffix == ".mp3" else "audio/webm"
    return FileResponse(path, media_type=media_type)


def _transcribe_chunked(audio_path: Path, chunk_duration_ms: int = 10 * 60 * 1000) -> list[str]:
    """Split an audio file into chunks and transcribe each one."""
    from pydub import AudioSegment

    audio = AudioSegment.from_file(audio_path)
    chunks = [audio[i:i + chunk_duration_ms] for i in range(0, len(audio), chunk_duration_ms)]
    results = []
    for chunk in chunks:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=True) as tmp:
            chunk.export(tmp.name, format="mp3")
            with open(tmp.name, "rb") as f:
                result = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                )
            results.append(result.text)
    return results


@app.post("/meeting-notes/{note_id}/transcribe")
async def transcribe_meeting_note(
    note_id: int,
    filename: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if not openai_client:
        raise HTTPException(
            503,
            "OpenAI API key not configured. Set keys.openai_key in project_config.yaml.",
        )
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")

    # Collect audio files to transcribe
    audio_dir = MEETING_AUDIO_DIR / str(note_id)
    if filename:
        target = audio_dir / filename
        if (
            not target.exists()
            or not target.resolve().is_relative_to(MEETING_AUDIO_DIR.resolve())
        ):
            raise HTTPException(404, "Audio file not found")
        audio_paths = [target]
    else:
        if not audio_dir.exists():
            raise HTTPException(404, "No audio files for this meeting note")
        audio_paths = sorted(
            f for f in audio_dir.iterdir() if f.is_file()
        )
        if not audio_paths:
            raise HTTPException(404, "No audio files for this meeting note")

    # Transcribe each file and concatenate
    segments = []
    try:
        for audio_path in audio_paths:
            file_size = audio_path.stat().st_size
            if file_size > 25 * 1024 * 1024:  # 25MB Whisper limit
                segments.extend(_transcribe_chunked(audio_path))
            else:
                with open(audio_path, "rb") as af:
                    result = openai_client.audio.transcriptions.create(
                        model="whisper-1",
                        file=af,
                    )
                segments.append(result.text)
    except Exception:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Transcription failed: {traceback.format_exc()}")

    transcript = "\n\n".join(segments)
    _write_transcript(note_id, transcript)

    n.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()

    return {"transcript": transcript}


class SuggestedTodo(BaseModel):
    title: str
    description: str = ""


@app.post("/meeting-notes/{note_id}/suggest-todos")
async def suggest_todos(note_id: int, db: Session = Depends(get_db)):
    if not openai_client:
        raise HTTPException(
            503,
            "OpenAI API key not configured. Set keys.openai_key in project_config.yaml.",
        )
    n = db.query(MeetingNote).get(note_id)
    if not n:
        raise HTTPException(404, "Meeting note not found")

    content = _read_note_content(n.filename)
    transcript = _read_transcript(n.id)

    parts = []
    if content.strip():
        parts.append(f"## Meeting Notes\n{content}")
    if transcript and transcript.strip():
        parts.append(f"## Transcript\n{transcript}")
    if not parts:
        return {"suggestions": []}

    combined = "\n\n".join(parts)

    suggest_model = (PROJECT_CONFIG.get("models") or {}).get("suggest_todos", "gpt-4o-mini")
    response = openai_client.chat.completions.create(
        model=suggest_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant that extracts actionable todo items from meeting notes and transcripts. "
                    "Return a JSON array of objects with 'title' (short actionable task title) and 'description' (brief context). "
                    "Only return concrete, actionable items. Return at most 10 items. "
                    "Return ONLY the JSON array, no other text."
                ),
            },
            {
                "role": "user",
                "content": f"Extract actionable todo items from the following meeting content:\n\n{combined}",
            },
        ],
        temperature=0.3,
    )

    import json

    raw = response.choices[0].message.content or "[]"
    # Strip markdown code fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        suggestions = json.loads(raw)
    except json.JSONDecodeError:
        suggestions = []

    return {"suggestions": suggestions}


@app.get("/meeting-notes-hidden", response_model=List[MeetingNoteSummary])
def list_hidden_meeting_notes(db: Session = Depends(get_db)):
    notes = (
        db.query(MeetingNote)
        .filter(MeetingNote.hidden == True)
        .order_by(MeetingNote.date.desc())
        .all()
    )
    return [meeting_note_to_summary(n) for n in notes]


@app.get("/meeting-notes-hidden/search", response_model=List[MeetingNoteSearchResult])
def search_hidden_meeting_notes(
    q: str = Query(..., min_length=1), db: Session = Depends(get_db)
):
    q_lower = q.lower()
    results = []
    notes = (
        db.query(MeetingNote)
        .filter(MeetingNote.hidden == True)
        .order_by(MeetingNote.date.desc())
        .all()
    )
    for n in notes:
        content = _read_note_content(n.filename)
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if q_lower in line.lower():
                start = max(0, i - 1)
                end = min(len(lines), i + 2)
                snippet = "\n".join(lines[start:end])
                results.append(
                    MeetingNoteSearchResult(
                        id=n.id, title=n.title, date=n.date, snippet=snippet
                    )
                )
                break
        if q_lower in n.title.lower() and not any(r.id == n.id for r in results):
            results.append(
                MeetingNoteSearchResult(id=n.id, title=n.title, date=n.date, snippet="")
            )
    return results


# ─── Meeting Templates ─────────────────────────────────────────────────────


@app.get("/meeting-templates", response_model=List[MeetingTemplateOut])
def list_meeting_templates():
    templates = []
    for f in sorted(MEETING_TEMPLATES_DIR.glob("*.md")):
        templates.append(
            MeetingTemplateOut(name=f.stem, content=f.read_text(encoding="utf-8"))
        )
    return templates


@app.get("/meeting-templates/{name}", response_model=MeetingTemplateOut)
def get_meeting_template(name: str):
    path = MEETING_TEMPLATES_DIR / f"{name}.md"
    if not path.exists():
        raise HTTPException(404, "Template not found")
    return MeetingTemplateOut(name=name, content=path.read_text(encoding="utf-8"))


# ─── Config (user settings shared with frontend) ─────────────────────────────


class TodoDefaultsPatch(BaseModel):
    assignee_name: Optional[str] = None
    deadline_to_today: Optional[bool] = None
    estimated_hours: Optional[str] = None
    importance: Optional[str] = None


class UserSettingsPatch(BaseModel):
    timezone: Optional[str] = None
    theme: Optional[str] = None
    meeting_note_sort: Optional[str] = None
    todo_defaults: Optional[TodoDefaultsPatch] = None
    hotkeys: Optional[dict] = None


def _validate_patch(patch: UserSettingsPatch) -> None:
    if patch.timezone is not None:
        try:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
            ZoneInfo(patch.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(400, f"Unknown IANA timezone: {patch.timezone}")
    if patch.theme is not None and patch.theme not in ("light", "dark"):
        raise HTTPException(400, f"Unknown theme: {patch.theme}")
    if patch.meeting_note_sort is not None and patch.meeting_note_sort not in ("created_at", "updated_at"):
        raise HTTPException(400, f"Unknown meeting_note_sort: {patch.meeting_note_sort}")
    if patch.todo_defaults and patch.todo_defaults.importance is not None:
        if patch.todo_defaults.importance not in ("low", "medium", "high", "critical"):
            raise HTTPException(400, f"Unknown importance: {patch.todo_defaults.importance}")


@app.get("/config/settings")
def get_settings_endpoint():
    return _merged_user_settings()


@app.put("/config/settings")
def update_settings_endpoint(patch: UserSettingsPatch):
    _validate_patch(patch)
    stored = _load_user_settings()
    data = patch.model_dump(exclude_unset=True)
    if "todo_defaults" in data and data["todo_defaults"] is not None:
        existing_td = stored.get("todo_defaults") or {}
        stored["todo_defaults"] = {**existing_td, **data["todo_defaults"]}
        del data["todo_defaults"]
    if "hotkeys" in data and data["hotkeys"] is not None:
        existing_hk = stored.get("hotkeys") or {}
        stored["hotkeys"] = {**existing_hk, **data["hotkeys"]}
        del data["hotkeys"]
    stored.update(data)
    _save_user_settings(stored)
    return _merged_user_settings()


# ─── Backup (manual trigger) ─────────────────────────────────────────────────


class BackupRunOut(BaseModel):
    date: str
    snapshot: str


@app.post("/backup/run", response_model=BackupRunOut)
async def run_backup_endpoint():
    from zoneinfo import ZoneInfo
    try:
        now_local = datetime.now(ZoneInfo(get_user_timezone()))
    except Exception:
        now_local = datetime.now().astimezone()
    try:
        result = await asyncio.to_thread(lambda: run_backup_once(today=now_local.date()))
    except Exception as e:
        log.exception("manual backup failed")
        raise HTTPException(500, f"backup failed: {e}")
    return BackupRunOut(**result)
