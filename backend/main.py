import asyncio
import hashlib
import io
import json
import logging
import math
import os
import re
import secrets
import shutil
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict, deque
from typing import List, Optional

import yaml
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, UploadFile

from backup.backup import run_backup_once
from backup.scheduler import backup_loop
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from openai import OpenAI
from pydantic import BaseModel, Field
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
    event,
    func,
    inspect,
    nullslast,
    or_,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Session, joinedload, relationship, sessionmaker

load_dotenv(Path(__file__).parent / ".env")

PROJECT_CONFIG_PATH = Path(__file__).parent.parent / "project_config.yaml"
with open(PROJECT_CONFIG_PATH, encoding="utf-8") as _f:
    PROJECT_CONFIG = yaml.safe_load(_f) or {}

_openai_key = os.environ.get("OPENAI_API_KEY", "")
openai_client: Optional[OpenAI] = OpenAI(api_key=_openai_key) if _openai_key else None

logger = logging.getLogger("management")

# All persistent state (DB, media, settings). Defaults to backend/ for local
# dev; production sets DATA_DIR=/data so deploys never touch data.
DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent)))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ─── User settings (persisted, shared with frontend) ─────────────────────────

USER_SETTINGS_PATH = DATA_DIR / "user_settings.json"

DEFAULT_USER_SETTINGS: dict = {
    "timezone": None,
    "theme": "light",
    "theme_variant": "linear-emerald",
    "font_size": "md",
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


def today_in_user_tz() -> str:
    """Today's calendar date (YYYY-MM-DD) in the user's configured timezone."""
    from zoneinfo import ZoneInfo
    try:
        now = datetime.now(ZoneInfo(get_user_timezone()))
    except Exception:
        now = datetime.now().astimezone()
    return now.strftime("%Y-%m-%d")


# Fallback check-in cadence for persons created before the column existed.
DEFAULT_CHECK_IN_INTERVAL_DAYS = 2

MEETING_NOTES_DIR = DATA_DIR / "meeting_notes"
MEETING_TEMPLATES_DIR = DATA_DIR / "meeting_templates"
MEETING_AUDIO_DIR = DATA_DIR / "meeting_audio"
MEETING_TRANSCRIPTS_DIR = DATA_DIR / "meeting_transcripts"
NOTES_DIR = DATA_DIR / "notes"
MEETING_NOTES_DIR.mkdir(exist_ok=True)
MEETING_TEMPLATES_DIR.mkdir(exist_ok=True)
MEETING_AUDIO_DIR.mkdir(exist_ok=True)
MEETING_TRANSCRIPTS_DIR.mkdir(exist_ok=True)
NOTES_DIR.mkdir(exist_ok=True)

# When set (always in prod, where it defaults to DATA_DIR), user-created vaults
# must live under this root; unset in local dev to allow arbitrary folders.
_vaults_root_env = os.environ.get("VAULTS_ROOT") or os.environ.get("DATA_DIR")
VAULTS_ROOT: Optional[Path] = Path(_vaults_root_env).resolve() if _vaults_root_env else None

DATABASE_URL = f"sqlite:///{DATA_DIR / 'management.db'}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


class Base(DeclarativeBase):
    pass


# Many-to-many: todo blocked_by other todos
todo_blockers = Table(
    "todo_blockers",
    Base.metadata,
    Column("todo_id", Integer, ForeignKey("todos.id"), primary_key=True),
    Column("blocker_id", Integer, ForeignKey("todos.id"), primary_key=True),
)


# Many-to-many: persons ↔ projects (display_order preserves user-chosen ordering)
person_projects = Table(
    "person_projects",
    Base.metadata,
    Column("person_id", Integer, ForeignKey("persons.id"), primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
    Column("display_order", Integer, default=0, nullable=False),
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
    notes = Column(Text, nullable=True)
    display_order = Column(Integer, default=0, nullable=False)
    deleted_at = Column(String, nullable=True)
    # Check-in cadence tracking. Only direct reports raise dashboard warnings, but
    # last_check_in_date (YYYY-MM-DD) is recorded for everyone.
    is_direct_report = Column(Boolean, default=False, nullable=False)
    check_in_interval_days = Column(Integer, default=2, nullable=False)
    last_check_in_date = Column(String, nullable=True)  # YYYY-MM-DD
    todos = relationship("Todo", back_populates="assignee")
    projects = relationship(
        "Project",
        secondary=person_projects,
        order_by=person_projects.c.display_order,
    )


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    parent_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    deadline = Column(String, nullable=True)
    deleted_at = Column(String, nullable=True)
    display_order = Column(Integer, nullable=False, default=0)
    importance = Column(String, nullable=False, default="medium")
    board_hidden = Column(Integer, nullable=False, default=0)  # SQLite-friendly bool
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


note_tags = Table(
    "note_tags",
    Base.metadata,
    Column("note_id", Integer, ForeignKey("notes.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True),
)


# Associations on Note (any note can carry these, kind='meeting' just makes them
# visible by default in the UI).
note_attendees = Table(
    "note_attendees",
    Base.metadata,
    Column("note_id", Integer, ForeignKey("notes.id"), primary_key=True),
    Column("person_id", Integer, ForeignKey("persons.id"), primary_key=True),
)

note_projects = Table(
    "note_projects",
    Base.metadata,
    Column("note_id", Integer, ForeignKey("notes.id"), primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
)

note_todos = Table(
    "note_todos",
    Base.metadata,
    Column("note_id", Integer, ForeignKey("notes.id"), primary_key=True),
    Column("todo_id", Integer, ForeignKey("todos.id"), primary_key=True),
)


class Vault(Base):
    __tablename__ = "vaults"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    root_path = Column(String, nullable=False)
    is_managed = Column(Boolean, default=False)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    last_scan_at = Column(String, nullable=True)


class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    # filename is legacy (preserved for back-compat); relative_path is authoritative under Phase 4
    filename = Column(String, nullable=True)
    vault_id = Column(Integer, ForeignKey("vaults.id"), nullable=True, index=True)
    relative_path = Column(String, nullable=True)
    mgmt_id = Column(String, unique=True, nullable=True, index=True)
    mtime = Column(Float, nullable=True)
    size = Column(Integer, nullable=True)
    last_indexed_at = Column(String, nullable=True)
    kind = Column(String, nullable=False, default="personal", index=True)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    updated_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    hidden = Column(Boolean, default=False)
    tags = relationship("Tag", secondary=note_tags, backref="notes")
    attendees = relationship("Person", secondary=note_attendees)
    projects = relationship("Project", secondary=note_projects)
    todos = relationship("Todo", secondary=note_todos)
    meeting_details = relationship(
        "MeetingDetails", uselist=False, back_populates="note", cascade="all, delete-orphan"
    )
    vault = relationship("Vault")


class MeetingDetails(Base):
    __tablename__ = "meeting_details"
    note_id = Column(Integer, ForeignKey("notes.id"), primary_key=True)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    note = relationship("Note", back_populates="meeting_details")


class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)  # argon2id encoded string
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    is_active = Column(Boolean, default=True, nullable=False)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String, unique=True, nullable=False, index=True)  # sha256(token)
    created_at = Column(String, nullable=False)
    last_seen_at = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)
    user_agent = Column(String, default="")


class ApiToken(Base):
    """Personal access token for agents/scripts. Sent as `Authorization: Bearer`.

    Scopes are a comma-separated subset of API_TOKEN_SCOPES; which endpoints
    each scope unlocks is defined by _BEARER_ROUTE_SCOPES next to the auth
    middleware. Revoked tokens are kept (revoked_at set) as a record.
    """
    __tablename__ = "api_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    token_hash = Column(String, unique=True, nullable=False, index=True)  # sha256(token)
    scopes = Column(String, nullable=False, default="")
    created_at = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)
    last_used_at = Column(String, nullable=True)
    revoked_at = Column(String, nullable=True)


class ApiAudit(Base):
    """One row per mutating bearer-token request (what an agent did, and when).

    Pruned after API_AUDIT_RETENTION_DAYS in lifespan().
    """
    __tablename__ = "api_audit"
    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(Integer, ForeignKey("api_tokens.id"), nullable=False, index=True)
    ts = Column(String, nullable=False)
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    status = Column(Integer, nullable=False)
    body = Column(Text, default="")  # request JSON, truncated


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
    _project_cols = [c["name"] for c in _insp.get_columns("projects")]
    if "display_order" not in _project_cols:
        _conn.execute(text("ALTER TABLE projects ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0"))
        _conn.execute(text("UPDATE projects SET display_order = id WHERE display_order = 0"))
        _conn.commit()
    if "importance" not in _project_cols:
        _conn.execute(text("ALTER TABLE projects ADD COLUMN importance TEXT NOT NULL DEFAULT 'medium'"))
        _conn.commit()
    if "board_hidden" not in _project_cols:
        _conn.execute(text("ALTER TABLE projects ADD COLUMN board_hidden INTEGER NOT NULL DEFAULT 0"))
        _conn.commit()
    _person_cols = [c["name"] for c in _insp.get_columns("persons")]
    if "notes" not in _person_cols:
        _conn.execute(text("ALTER TABLE persons ADD COLUMN notes TEXT"))
        _conn.commit()
    if "deleted_at" not in _person_cols:
        _conn.execute(text("ALTER TABLE persons ADD COLUMN deleted_at TEXT"))
        _conn.commit()
    if "display_order" not in _person_cols:
        _conn.execute(text("ALTER TABLE persons ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0"))
        # Seed sensible initial ordering: existing rows in id order.
        _conn.execute(text(
            "UPDATE persons SET display_order = id WHERE display_order = 0"
        ))
        _conn.commit()
    # Check-in cadence tracking (last_check_in_date is backfilled in lifespan()).
    if "is_direct_report" not in _person_cols:
        _conn.execute(text("ALTER TABLE persons ADD COLUMN is_direct_report INTEGER NOT NULL DEFAULT 0"))
        _conn.commit()
    if "check_in_interval_days" not in _person_cols:
        _conn.execute(text("ALTER TABLE persons ADD COLUMN check_in_interval_days INTEGER NOT NULL DEFAULT 2"))
        _conn.commit()
    if "last_check_in_date" not in _person_cols:
        _conn.execute(text("ALTER TABLE persons ADD COLUMN last_check_in_date TEXT"))
        _conn.commit()
    # Phase 4: vault metadata on notes
    _note_cols = [c["name"] for c in _insp.get_columns("notes")]
    for _col, _ddl in (
        ("vault_id", "ALTER TABLE notes ADD COLUMN vault_id INTEGER REFERENCES vaults(id)"),
        ("relative_path", "ALTER TABLE notes ADD COLUMN relative_path TEXT"),
        ("mgmt_id", "ALTER TABLE notes ADD COLUMN mgmt_id TEXT"),
        ("mtime", "ALTER TABLE notes ADD COLUMN mtime REAL"),
        ("size", "ALTER TABLE notes ADD COLUMN size INTEGER"),
        ("last_indexed_at", "ALTER TABLE notes ADD COLUMN last_indexed_at TEXT"),
    ):
        if _col not in _note_cols:
            _conn.execute(text(_ddl))
            _conn.commit()
    if "mgmt_id" not in _note_cols:
        _conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_notes_mgmt_id ON notes(mgmt_id)"))
        _conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_vault_id ON notes(vault_id)"))
        _conn.commit()
    # Drop legacy UNIQUE/NOT NULL on notes.filename — filenames may collide across vaults
    # under Phase 4; relative_path (scoped by vault_id) is the authoritative identifier.
    _notes_ddl = _conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'")
    ).scalar()
    if _notes_ddl and "UNIQUE (filename)" in _notes_ddl:
        _conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        _conn.exec_driver_sql("BEGIN")
        _conn.exec_driver_sql(
            """
            CREATE TABLE notes_new (
                id INTEGER NOT NULL PRIMARY KEY,
                title VARCHAR NOT NULL,
                filename VARCHAR,
                kind VARCHAR NOT NULL,
                created_at VARCHAR,
                updated_at VARCHAR,
                hidden BOOLEAN,
                vault_id INTEGER REFERENCES vaults(id),
                relative_path TEXT,
                mgmt_id TEXT,
                mtime REAL,
                size INTEGER,
                last_indexed_at TEXT
            )
            """
        )
        _conn.exec_driver_sql(
            """
            INSERT INTO notes_new (
                id, title, filename, kind, created_at, updated_at, hidden,
                vault_id, relative_path, mgmt_id, mtime, size, last_indexed_at
            )
            SELECT
                id, title, filename, kind, created_at, updated_at, hidden,
                vault_id, relative_path, mgmt_id, mtime, size, last_indexed_at
            FROM notes
            """
        )
        _conn.exec_driver_sql("DROP TABLE notes")
        _conn.exec_driver_sql("ALTER TABLE notes_new RENAME TO notes")
        _conn.exec_driver_sql("CREATE INDEX ix_notes_id ON notes (id)")
        _conn.exec_driver_sql("CREATE INDEX ix_notes_kind ON notes (kind)")
        _conn.exec_driver_sql("CREATE UNIQUE INDEX ix_notes_mgmt_id ON notes(mgmt_id)")
        _conn.exec_driver_sql("CREATE INDEX ix_notes_vault_id ON notes(vault_id)")
        _conn.exec_driver_sql("COMMIT")
        _conn.exec_driver_sql("PRAGMA foreign_keys=ON")


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
    notes: Optional[str] = None
    project_ids: Optional[List[int]] = None
    is_direct_report: Optional[bool] = None
    check_in_interval_days: Optional[int] = Field(None, ge=1)
    last_check_in_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    project_ids: Optional[List[int]] = None
    is_direct_report: Optional[bool] = None
    check_in_interval_days: Optional[int] = Field(None, ge=1)
    last_check_in_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class PersonOut(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    notes: Optional[str] = None
    display_order: int = 0
    deleted_at: Optional[str] = None
    project_ids: List[int] = []
    project_names: List[str] = []
    is_direct_report: bool = False
    check_in_interval_days: int = 2
    last_check_in_date: Optional[str] = None
    model_config = {"from_attributes": True}


class PersonOrderItem(BaseModel):
    id: int
    display_order: int


def person_to_out(p: Person) -> PersonOut:
    active_projects = [pr for pr in p.projects if pr.deleted_at is None]
    return PersonOut(
        id=p.id,
        name=p.name,
        email=p.email,
        notes=p.notes,
        display_order=p.display_order,
        deleted_at=p.deleted_at,
        project_ids=[pr.id for pr in active_projects],
        project_names=[pr.name for pr in active_projects],
        is_direct_report=bool(p.is_direct_report),
        check_in_interval_days=p.check_in_interval_days or DEFAULT_CHECK_IN_INTERVAL_DAYS,
        last_check_in_date=p.last_check_in_date,
    )


def _set_person_projects(db: Session, person_id: int, project_ids: List[int]) -> None:
    db.execute(person_projects.delete().where(person_projects.c.person_id == person_id))
    seen: set[int] = set()
    for i, pid in enumerate(project_ids):
        if pid in seen:
            continue
        seen.add(pid)
        proj = db.query(Project).get(pid)
        if proj is None or proj.deleted_at is not None:
            continue
        db.execute(person_projects.insert().values(
            person_id=person_id, project_id=pid, display_order=i,
        ))


def _bump_check_ins_for_meeting(note: "Note", meeting_date: Optional[str]) -> None:
    """Advance attendees' last_check_in_date to this meeting's date.

    A watermark, never rolled backwards: re-dating a meeting into the past or
    dropping an attendee leaves the recorded value alone. Future-dated meetings
    are ignored — a scheduled 1:1 is not a check-in that already happened.
    """
    if note.kind != "meeting" or note.hidden or not meeting_date:
        return
    if meeting_date > today_in_user_tz():
        return
    for person in note.attendees:
        if person.last_check_in_date is None or meeting_date > person.last_check_in_date:
            person.last_check_in_date = meeting_date


def _backfill_person_check_ins(db: Session) -> None:
    """Seed last_check_in_date from existing meeting notes (nulls only, so this
    is a no-op on every boot after the first and never clobbers manual edits)."""
    db.execute(text(
        """
        UPDATE persons SET last_check_in_date = (
            SELECT MAX(md.date)
            FROM note_attendees na
            JOIN notes n ON n.id = na.note_id
            JOIN meeting_details md ON md.note_id = n.id
            WHERE na.person_id = persons.id
              AND n.hidden = 0
              AND md.date <= :today
        )
        WHERE last_check_in_date IS NULL
        """
    ), {"today": today_in_user_tz()})


PROJECT_IMPORTANCE_VALUES = {"low", "medium", "high"}


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None
    importance: Optional[str] = None
    display_order: Optional[int] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None
    importance: Optional[str] = None
    display_order: Optional[int] = None
    board_hidden: Optional[bool] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None
    deleted_at: Optional[str] = None
    display_order: int = 0
    importance: str = "medium"
    board_hidden: bool = False
    model_config = {"from_attributes": True}


class ProjectTreeOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None
    display_order: int = 0
    importance: str = "medium"
    board_hidden: bool = False
    subprojects: List["ProjectTreeOut"] = []
    model_config = {"from_attributes": True}


ProjectTreeOut.model_rebuild()


class ProjectOrderItem(BaseModel):
    id: int
    display_order: int


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



class AudioFileInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: str

class NoteCreate(BaseModel):
    title: str
    content: str = ""
    kind: str = "personal"
    date: Optional[str] = None  # required when kind='meeting'
    attendee_ids: List[int] = []
    project_ids: List[int] = []
    todo_ids: List[int] = []
    template: Optional[str] = None
    vault_id: Optional[int] = None  # defaults to managed vault


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    date: Optional[str] = None
    attendee_ids: Optional[List[int]] = None
    project_ids: Optional[List[int]] = None
    todo_ids: Optional[List[int]] = None
    transcript: Optional[str] = None


class NoteOut(BaseModel):
    id: int
    title: str
    filename: Optional[str] = None
    kind: str
    content: str
    created_at: str
    updated_at: str
    tags: List[str] = []
    date: Optional[str] = None
    attendee_ids: List[int] = []
    attendee_names: List[str] = []
    project_ids: List[int] = []
    project_names: List[str] = []
    todo_ids: List[int] = []
    todo_titles: List[str] = []
    transcript: Optional[str] = None
    audio_files: List[AudioFileInfo] = []
    vault_id: Optional[int] = None
    vault_name: Optional[str] = None
    vault_root_path: Optional[str] = None
    relative_path: Optional[str] = None
    content_unavailable: bool = False
    model_config = {"from_attributes": True}


class NoteSummary(BaseModel):
    id: int
    title: str
    kind: str
    created_at: str
    updated_at: str
    tags: List[str] = []
    date: Optional[str] = None
    attendee_names: List[str] = []
    project_names: List[str] = []
    todo_count: int = 0
    model_config = {"from_attributes": True}


class NoteSearchResult(BaseModel):
    id: int
    title: str
    kind: str
    snippet: str
    date: Optional[str] = None


class TagOut(BaseModel):
    name: str
    note_count: int


class VaultCreate(BaseModel):
    name: str
    root_path: str


class VaultOut(BaseModel):
    id: int
    name: str
    root_path: str
    is_managed: bool
    created_at: str
    last_scan_at: Optional[str] = None
    note_count: int = 0
    model_config = {"from_attributes": True}


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
        display_order=p.display_order or 0,
        importance=p.importance or "medium",
        board_hidden=bool(p.board_hidden),
        subprojects=[
            project_to_tree(sp) for sp in sorted(
                (sp for sp in p.subprojects if sp.deleted_at is None),
                key=lambda sp: (sp.display_order or 0, sp.id),
            )
        ],
    )


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


# ─── Frontmatter helpers (Phase 4) ─────────────────────────────────────────
#
# Notes carry YAML frontmatter when they live in a vault. The app reserves the
# `mgmt_*` key prefix (currently mgmt_id, mgmt_status, mgmt_trashed_at) and
# never touches user-authored keys.


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Return (frontmatter_dict, body). Empty dict if no/invalid frontmatter."""
    if not content.startswith("---"):
        return {}, content
    lines = content.split("\n")
    if lines[0].strip() != "---":
        return {}, content
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return {}, content
    try:
        fm = yaml.safe_load("\n".join(lines[1:end_idx]))
    except yaml.YAMLError:
        return {}, content
    if not isinstance(fm, dict):
        return {}, content
    body = "\n".join(lines[end_idx + 1:])
    return fm, body


def _serialize_with_frontmatter(fm: dict, body: str) -> str:
    if not fm:
        return body
    yaml_text = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True)
    if not yaml_text.endswith("\n"):
        yaml_text += "\n"
    return f"---\n{yaml_text}---\n{body}"


def _note_path(note: "Note") -> Path:
    """Resolve absolute disk path for a Note via its vault + relative_path."""
    if note.vault is None or not note.relative_path:
        # Legacy fallback: pre-Phase-4 notes live in NOTES_DIR keyed by filename.
        return NOTES_DIR / (note.filename or "")
    return Path(note.vault.root_path) / note.relative_path


def _require_accessible_vault(vault: Optional["Vault"]) -> None:
    """Refuse disk writes when the vault root is missing — e.g. a root_path
    minted on another machine before the DB moved. Writing would mkdir the
    path on whatever filesystem is behind it (on Fly, the ephemeral rootfs)
    and the data would silently vanish on restart."""
    if vault is not None and not Path(vault.root_path).is_dir():
        raise HTTPException(
            409, f"Vault '{vault.name}' root is not accessible: {vault.root_path}"
        )


def _vault_root_missing(note: "Note") -> bool:
    """True when the note's vault root is unreachable, so its body cannot be
    read at all. Distinct from a genuinely empty note: callers must not present
    an unreadable note as blank, or a whole vault looks silently wiped."""
    return note.vault is not None and not Path(note.vault.root_path).is_dir()


def _read_note_body(note: "Note") -> str:
    """Return note body (stripping frontmatter). Empty if file missing."""
    path = _note_path(note)
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8")
    _, body = _parse_frontmatter(content)
    return body


def _write_note_body(note: "Note", body: str) -> None:
    """Replace body of the note's file, preserving its frontmatter on disk."""
    _require_accessible_vault(note.vault)
    path = _note_path(note)
    fm: dict = {}
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        fm, _ = _parse_frontmatter(existing)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_serialize_with_frontmatter(fm, body), encoding="utf-8")


def _slugify_title_for_filename(title: str, max_len: int = 100) -> str:
    """Convert a note title to a safe filename stem (no `.md`, no path separators).

    Strips control chars, path separators, and chars that are illegal on common
    filesystems (Windows + macOS). Collapses whitespace runs. Returns "" if the
    input has nothing usable.
    """
    if not title:
        return ""
    t = _re.sub(r"[\\/:\*\?\"<>\|\x00-\x1f]", " ", title)
    t = _re.sub(r"\s+", " ", t).strip()
    t = t.lstrip(".").strip()
    return t[:max_len].rstrip()


def _resolve_unique_filename(
    vault_root: Path,
    directory: str,
    stem: str,
    current_rel_path: Optional[str],
) -> str:
    """Return a vault-relative path of the form `<directory>/<stem>.md` or
    `<directory>/<stem>_N.md` that does not collide with an existing file.

    The current note's own path is considered free, so renaming to the same
    name is a no-op rather than appending `_1`.
    """
    def candidate(suffix: str) -> str:
        name = f"{stem}{suffix}.md"
        return str(Path(directory) / name) if directory else name

    def is_free(rel: str) -> bool:
        if current_rel_path and str(Path(rel)) == str(Path(current_rel_path)):
            return True
        return not (vault_root / rel).exists()

    if is_free(candidate("")):
        return candidate("")
    for i in range(1, 10000):
        c = candidate(f"_{i}")
        if is_free(c):
            return c
    raise RuntimeError(f"Could not find a free filename for {stem!r}")


def _update_note_frontmatter(note: "Note", patch: dict, remove_keys: Optional[set] = None) -> None:
    """Patch frontmatter keys on disk. `patch` upserts, `remove_keys` clears.

    Raises FileNotFoundError when the vault root is missing so trash/restore
    degrade to their DB-flag-only path instead of writing outside the vault.
    """
    if note.vault is not None and not Path(note.vault.root_path).is_dir():
        raise FileNotFoundError(f"vault root not accessible: {note.vault.root_path}")
    path = _note_path(note)
    fm: dict = {}
    body = ""
    if path.exists():
        content = path.read_text(encoding="utf-8")
        fm, body = _parse_frontmatter(content)
    if remove_keys:
        for k in remove_keys:
            fm.pop(k, None)
    fm.update(patch)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_serialize_with_frontmatter(fm, body), encoding="utf-8")


import re as _re

_TAG_REGEX = _re.compile(
    r"(?<![A-Za-z0-9_/-])#([A-Za-z][A-Za-z0-9_-]*(?:/[A-Za-z][A-Za-z0-9_-]*)*)"
)


def _strip_for_tag_extraction(body: str) -> str:
    body = _re.sub(r"```.*?```", " ", body, flags=_re.DOTALL)
    body = _re.sub(r"`[^`\n]+`", " ", body)
    body = _re.sub(r"<!--.*?-->", " ", body, flags=_re.DOTALL)
    body = _re.sub(r"\b(?:https?|ftp|mailto):[^\s<>\"'`]+", " ", body)
    return body


def extract_tags(body: str) -> set:
    """Return the set of lowercased tag names found in the markdown body."""
    if not body:
        return set()
    stripped = _strip_for_tag_extraction(body)
    return {m.group(1).lower() for m in _TAG_REGEX.finditer(stripped)}


def sync_tags_for_note(db: Session, note: Note, body: str) -> None:
    """Reconcile note.tags with the tags found in the body. Idempotent."""
    extracted = extract_tags(body)
    if not extracted:
        note.tags = []
        return
    existing = {t.name: t for t in db.query(Tag).filter(Tag.name.in_(extracted)).all()}
    next_tags = []
    new_added = False
    for name in extracted:
        t = existing.get(name)
        if t is None:
            t = Tag(name=name)
            db.add(t)
            new_added = True
        next_tags.append(t)
    # autoflush is off, so flush new Tag inserts immediately. Otherwise a
    # subsequent call in the same transaction wouldn't see them and would
    # attempt to re-insert, tripping the UNIQUE constraint on tags.name.
    if new_added:
        db.flush()
    note.tags = next_tags


def _backfill_meeting_notes_tag(db: Session) -> None:
    """Ensure every meeting note has #meeting-notes in body, and re-sync tags.

    Tag re-sync runs for every note (not just freshly-edited ones) so prior
    regex-rule changes (e.g. hyphen support) are reflected without requiring a
    body edit.
    """
    notes = db.query(Note).filter(Note.kind == "meeting").all()
    for n in notes:
        path = _note_path(n)
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        fm, body = _parse_frontmatter(content)
        if "meeting-notes" not in extract_tags(body):
            body = "#meeting-notes\n\n" + body.lstrip("\n")
            path.write_text(_serialize_with_frontmatter(fm, body), encoding="utf-8")
            st = path.stat()
            n.mtime = st.st_mtime
            n.size = st.st_size
        sync_tags_for_note(db, n, body)
        db.flush()


def _resync_all_note_tags(db: Session) -> None:
    """Re-extract tags for every note. Cheap; rectifies stale rows after regex changes."""
    for n in db.query(Note).all():
        path = _note_path(n)
        if not path.exists():
            continue
        _, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
        sync_tags_for_note(db, n, body)
        db.flush()


def note_to_out(n: Note) -> NoteOut:
    md = n.meeting_details
    is_meeting = n.kind == "meeting" or md is not None
    return NoteOut(
        id=n.id,
        title=n.title,
        filename=n.filename,
        kind=n.kind,
        content=_read_note_body(n),
        created_at=n.created_at,
        updated_at=n.updated_at,
        tags=sorted(t.name for t in n.tags),
        date=md.date if md else None,
        attendee_ids=[p.id for p in n.attendees],
        attendee_names=[p.name for p in n.attendees],
        project_ids=[p.id for p in n.projects],
        project_names=[p.name for p in n.projects],
        todo_ids=[t.id for t in n.todos],
        todo_titles=[t.title for t in n.todos],
        transcript=_read_transcript(n.id) if is_meeting else None,
        audio_files=_list_audio_files(n.id) if is_meeting else [],
        vault_id=n.vault_id,
        vault_name=n.vault.name if n.vault else None,
        vault_root_path=n.vault.root_path if n.vault else None,
        relative_path=n.relative_path,
        content_unavailable=_vault_root_missing(n),
    )


def note_to_summary(n: Note) -> NoteSummary:
    md = n.meeting_details
    return NoteSummary(
        id=n.id,
        title=n.title,
        kind=n.kind,
        created_at=n.created_at,
        updated_at=n.updated_at,
        tags=sorted(t.name for t in n.tags),
        date=md.date if md else None,
        attendee_names=[p.name for p in n.attendees],
        project_names=[p.name for p in n.projects],
        todo_count=len(n.todos),
    )


# ─── App ─────────────────────────────────────────────────────────────────────

log = logging.getLogger("management")


def _migrate_meeting_notes_to_unified_notes(db: Session) -> None:
    """One-time migration: meeting_notes rows → notes + meeting_details + associations.

    Idempotent: bails early if any meeting-kind note already exists.
    Robust to id conflicts: if a notes.id is already taken, the meeting note
    gets a fresh id and its sidecar dirs (audio + transcript) are renamed to match.
    Leaves the old meeting_notes table intact as a backup (per Phase 3 plan).
    """
    if db.query(Note).filter(Note.kind == "meeting").first() is not None:
        return  # already migrated

    legacy = db.query(MeetingNote).all()
    if not legacy:
        return  # nothing to migrate

    existing_ids = {nid for (nid,) in db.query(Note.id).all()}
    next_free = max(existing_ids, default=0) + 1

    for mn in legacy:
        target_id = mn.id
        if target_id in existing_ids:
            target_id = next_free
            next_free += 1
        existing_ids.add(target_id)

        # Copy the markdown file from meeting_notes/ → notes/. Filename preserved.
        src_md = MEETING_NOTES_DIR / mn.filename
        dst_md = NOTES_DIR / mn.filename
        body = ""
        if src_md.exists():
            body = src_md.read_text(encoding="utf-8")
            if not dst_md.exists():
                shutil.copy2(src_md, dst_md)

        # Sidecars (audio + transcript) are keyed by note id. If we remap, copy.
        if target_id != mn.id:
            old_audio = MEETING_AUDIO_DIR / str(mn.id)
            new_audio = MEETING_AUDIO_DIR / str(target_id)
            if old_audio.exists() and not new_audio.exists():
                shutil.copytree(old_audio, new_audio)
            old_tx = MEETING_TRANSCRIPTS_DIR / f"{mn.id}.txt"
            new_tx = MEETING_TRANSCRIPTS_DIR / f"{target_id}.txt"
            if old_tx.exists() and not new_tx.exists():
                shutil.copy2(old_tx, new_tx)

        n = Note(
            id=target_id,
            title=mn.title,
            filename=mn.filename,
            kind="meeting",
            created_at=mn.created_at,
            updated_at=mn.updated_at,
            hidden=mn.hidden,
        )
        db.add(n)
        db.flush()

        db.add(MeetingDetails(note_id=target_id, date=mn.date))

        # Re-point associations
        if mn.attendees:
            n.attendees = list(mn.attendees)
        if mn.projects:
            n.projects = list(mn.projects)
        if mn.todos:
            n.todos = list(mn.todos)

        # Index tags from the body
        sync_tags_for_note(db, n, body)

    db.commit()
    log.info("Migrated %d meeting notes onto the unified Note model", len(legacy))


MANAGED_VAULT_NAME = "default"


def _get_or_create_managed_vault(db: Session) -> Vault:
    v = db.query(Vault).filter(Vault.is_managed == True).first()
    if v is not None:
        # root_path is an absolute path minted where the row was created; when
        # the DB moves to a machine with a different DATA_DIR (e.g. the Fly
        # volume), it goes stale and every note would read empty. Re-anchor it.
        expected = str(NOTES_DIR.resolve())
        if v.root_path != expected:
            log.warning("Managed vault root_path %s → %s", v.root_path, expected)
            v.root_path = expected
            db.commit()
        return v
    v = Vault(
        name=MANAGED_VAULT_NAME,
        root_path=str(NOTES_DIR.resolve()),
        is_managed=True,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    log.info("Created managed vault id=%d at %s", v.id, v.root_path)
    return v


def _backfill_vault_metadata(db: Session, managed: Vault) -> None:
    """For every Note lacking vault_id / mgmt_id, populate them and stamp frontmatter.

    Idempotent: only touches notes missing vault_id (the Phase 4 marker).
    Also propagates the DB `hidden` flag into frontmatter `mgmt_status: trashed`
    so external tools (Obsidian) can see/restore the soft-deleted state.
    """
    notes = db.query(Note).filter(Note.vault_id.is_(None)).all()
    if not notes:
        return

    for n in notes:
        n.vault_id = managed.id
        n.relative_path = n.filename  # managed-vault notes live at root, filename == rel path

        # Read existing on-disk content (no frontmatter yet for legacy notes)
        path = NOTES_DIR / n.filename
        existing_content = path.read_text(encoding="utf-8") if path.exists() else ""
        fm, body = _parse_frontmatter(existing_content)

        # Stamp mgmt_id if missing
        if "mgmt_id" not in fm:
            fm["mgmt_id"] = str(uuid.uuid4())
        n.mgmt_id = fm["mgmt_id"]

        # Mirror DB.hidden → frontmatter
        if n.hidden:
            fm["mgmt_status"] = "trashed"
            fm.setdefault("mgmt_trashed_at", datetime.now(timezone.utc).isoformat())
        else:
            fm.pop("mgmt_status", None)
            fm.pop("mgmt_trashed_at", None)

        # Write back (path may be brand-new for stale rows whose file was purged)
        if path.exists() or body:
            path.write_text(_serialize_with_frontmatter(fm, body), encoding="utf-8")
            stat = path.stat()
            n.mtime = stat.st_mtime
            n.size = stat.st_size
        n.last_indexed_at = datetime.now(timezone.utc).isoformat()

    db.commit()
    log.info("Backfilled vault metadata + mgmt_id for %d notes", len(notes))


# ─── Vault scanner ─────────────────────────────────────────────────────────


RESCAN_THROTTLE_SECONDS = int(
    (PROJECT_CONFIG.get("vaults") or {}).get("rescan_throttle_seconds", 30)
)

VAULT_SKIP_DIRS = {".obsidian", ".git", ".trash", "node_modules"}


def _scan_vault(db: Session, vault: Vault) -> dict:
    """Walk vault root, sync DB with disk. Returns a small stats dict."""
    root = Path(vault.root_path)
    if not root.exists() or not root.is_dir():
        return {"error": f"vault root not accessible: {vault.root_path}"}

    now_iso = datetime.now(timezone.utc).isoformat()

    # Map existing rows for this vault by mgmt_id
    existing = {
        n.mgmt_id: n
        for n in db.query(Note).filter(Note.vault_id == vault.id).all()
        if n.mgmt_id
    }
    seen: set = set()
    stats = {"created": 0, "updated": 0, "moved": 0, "trashed_changed": 0, "missing": 0}

    for path in sorted(root.rglob("*.md")):
        rel = path.relative_to(root)
        # Skip if any parent segment is a dot/Obsidian/system dir
        if any(part.startswith(".") or part in VAULT_SKIP_DIRS for part in rel.parts[:-1]):
            continue
        if rel.name.startswith("."):
            continue

        rel_str = str(rel)
        st = path.stat()
        content = path.read_text(encoding="utf-8")
        fm, body = _parse_frontmatter(content)
        mgmt_id = fm.get("mgmt_id")
        trashed = fm.get("mgmt_status") == "trashed"

        # Stamp mgmt_id on first encounter
        if not mgmt_id:
            mgmt_id = str(uuid.uuid4())
            fm["mgmt_id"] = mgmt_id
            path.write_text(_serialize_with_frontmatter(fm, body), encoding="utf-8")
            st = path.stat()  # refresh after write

        n = existing.get(mgmt_id)
        if n is None:
            n = Note(
                title=path.stem,
                filename=path.name,
                vault_id=vault.id,
                relative_path=rel_str,
                mgmt_id=mgmt_id,
                mtime=st.st_mtime,
                size=st.st_size,
                last_indexed_at=now_iso,
                kind="personal",
                hidden=trashed,
            )
            db.add(n)
            db.flush()
            sync_tags_for_note(db, n, body)
            stats["created"] += 1
        else:
            if n.relative_path != rel_str:
                n.relative_path = rel_str
                n.filename = path.name
                stats["moved"] += 1
            if n.mtime != st.st_mtime or n.size != st.st_size:
                n.mtime = st.st_mtime
                n.size = st.st_size
                sync_tags_for_note(db, n, body)
                n.updated_at = now_iso
                stats["updated"] += 1
            if n.hidden != trashed:
                n.hidden = trashed
                stats["trashed_changed"] += 1
            n.last_indexed_at = now_iso

        seen.add(mgmt_id)

    # Rows in DB but not on disk → mark hidden so they vanish from the active list.
    for mid, n in existing.items():
        if mid in seen:
            continue
        if not n.hidden:
            n.hidden = True
            stats["missing"] += 1

    vault.last_scan_at = now_iso
    db.commit()
    return stats


def _scan_vault_if_stale(db: Session, vault: Vault) -> None:
    """Run a scan only if the last scan was older than RESCAN_THROTTLE_SECONDS."""
    if not vault.last_scan_at:
        _scan_vault(db, vault)
        return
    try:
        last = datetime.fromisoformat(vault.last_scan_at)
    except ValueError:
        _scan_vault(db, vault)
        return
    age = (datetime.now(timezone.utc) - last).total_seconds()
    if age >= RESCAN_THROTTLE_SECONDS:
        _scan_vault(db, vault)


def _scan_all_vaults_if_stale(db: Session) -> None:
    for v in db.query(Vault).all():
        try:
            _scan_vault_if_stale(db, v)
        except Exception:
            log.exception("scan failed for vault id=%s", v.id)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    with SessionLocal() as db:
        db.query(Todo).filter(Todo.status.in_(["in_progress", "in-progress"])).update(
            {Todo.status: "todo"}, synchronize_session=False
        )
        # UTC isoformat strings compare lexically, so string <= string is safe here.
        db.query(AuthSession).filter(
            AuthSession.expires_at <= datetime.now(timezone.utc).isoformat()
        ).delete(synchronize_session=False)
        db.query(ApiAudit).filter(
            ApiAudit.ts <= (datetime.now(timezone.utc) - timedelta(days=API_AUDIT_RETENTION_DAYS)).isoformat()
        ).delete(synchronize_session=False)
        db.commit()
        _migrate_meeting_notes_to_unified_notes(db)
        managed_vault = _get_or_create_managed_vault(db)
        _backfill_vault_metadata(db, managed_vault)
        # Full scan of every vault on startup; picks up out-of-band edits.
        for v in db.query(Vault).all():
            try:
                stats = _scan_vault(db, v)
            except Exception:
                log.exception("startup scan failed for vault id=%s", v.id)
                continue
            if stats.get("error"):
                # An unreachable root makes every note in the vault read as an
                # empty body, which looks like data loss rather than a fault.
                # Say so loudly: root_path is absolute and machine-specific, so
                # it goes stale whenever the DB moves (laptop → Fly volume).
                n_affected = (
                    db.query(Note).filter(Note.vault_id == v.id).count()
                )
                log.error(
                    "Vault '%s' (id=%s) root is NOT accessible: %s — %d notes "
                    "will read as empty. Re-point vaults.root_path at a path on "
                    "this machine.",
                    v.name, v.id, v.root_path, n_affected,
                )
        _backfill_meeting_notes_tag(db)
        _resync_all_note_tags(db)
        _backfill_person_check_ins(db)
        db.commit()
    task = None
    if os.environ.get("BACKUP_LOOP_ENABLED", "1") == "1":
        task = asyncio.create_task(backup_loop(get_user_timezone))
    try:
        # The MCP streamable-HTTP session manager must be running for /mcp to
        # serve requests (mcp_server is imported at the bottom of this module).
        with SessionLocal() as db:
            mcp_server.prune_orphan_clients(db)
        async with mcp_server.session_manager.run():
            yield
    finally:
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


app = FastAPI(title="Management API", lifespan=lifespan)

APP_ORIGIN = os.environ.get("APP_ORIGIN", "")
_cors_origins = [
    origin
    for origin in (
        APP_ORIGIN,
        "https://dev.localhost:5173",
        "http://dev.localhost:5173",
        "http://localhost:5173",
    )
    if origin
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


# ─── Authentication ──────────────────────────────────────────────────────────

_password_hasher = PasswordHasher()
# Verified against when the username is unknown, so login duration doesn't
# reveal whether an account exists.
_DUMMY_HASH = _password_hasher.hash(secrets.token_urlsafe(16))

SESSION_COOKIE = "session"
SESSION_TTL = timedelta(days=90)
SESSION_REFRESH_INTERVAL = timedelta(hours=1)
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") == "1"

PUBLIC_PATHS = {"/auth/login", "/healthz"}
# Filled by mcp_server at import: /mcp and the OAuth endpoints enforce their
# own bearer/OAuth auth, so the cookie middleware must let them through.
MCP_PUBLIC_PATHS: set = set()
# Public origin for OAuth issuer / resource URLs. APP_ORIGIN in prod; local dev
# falls back to the uvicorn port from project_config.yaml.
PUBLIC_ORIGIN = (os.environ.get("APP_ORIGIN") or f"http://localhost:{PROJECT_CONFIG.get('backend', {}).get('port', 8001)}").rstrip("/")

LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 15 * 60
_login_failures: dict = defaultdict(deque)

# ─── API tokens (bearer auth for agents) ─────────────────────────────────────
#
# Bearer tokens are deny-by-default: a request is allowed only if a
# (method, path) rule below maps it to a scope the token holds. Anything not
# listed — auth, config, vaults, backup, deletes, purges, transcription, audio
# download, token management — stays cookie-session-only. Keep this table and
# backend/agent_manual.md in sync.

API_TOKEN_SCOPES = ("read", "write:todos", "write:persons", "write:notes", "write:daily")
API_TOKEN_PREFIX = "mgmt_pat_"
API_TOKEN_DEFAULT_DAYS = 90
API_TOKEN_MAX_DAYS = 365
API_TOKEN_USED_REFRESH = timedelta(hours=1)  # throttle last_used_at writes
API_AUDIT_RETENTION_DAYS = 90
API_AUDIT_BODY_MAX = 2000
BEARER_MAX_FAILURES = 10
BEARER_WINDOW_SECONDS = 15 * 60
_bearer_failures: dict = defaultdict(deque)

_ID = r"\d+"
_DATE = r"\d{4}-\d{2}-\d{2}"
_BEARER_ROUTE_SCOPES = [
    (m, re.compile(f"^{p}$"), s)
    for m, p, s in (
        # read
        ("GET", r"/agent/manual", "read"),
        ("GET", r"/agent/digest", "read"),
        ("GET", r"/agent/skill", "read"),
        ("GET", r"/openapi\.json", "read"),
        ("GET", r"/auth/me", "read"),
        ("GET", r"/todos", "read"),
        ("GET", r"/todos/deleted", "read"),
        ("GET", r"/todos/recently-done", "read"),
        ("GET", rf"/todos/{_ID}", "read"),
        ("GET", r"/projects", "read"),
        ("GET", r"/projects/tree", "read"),
        ("GET", r"/projects/deleted", "read"),
        ("GET", r"/persons", "read"),
        ("GET", r"/persons/progress", "read"),
        ("GET", r"/persons/deleted", "read"),
        ("GET", rf"/must-do/{_DATE}", "read"),
        ("GET", r"/daily-goals", "read"),
        ("GET", r"/schedule/reminders", "read"),
        ("GET", r"/tags", "read"),
        ("GET", r"/notes", "read"),
        ("GET", r"/notes/search", "read"),
        ("GET", r"/notes-hidden", "read"),
        ("GET", r"/notes-hidden/search", "read"),
        ("GET", rf"/notes/{_ID}", "read"),
        ("GET", rf"/notes/{_ID}/audio", "read"),
        # write:todos
        ("POST", r"/todos", "write:todos"),
        ("PUT", r"/todos/reorder-focus", "write:todos"),
        ("PUT", r"/todos/focus", "write:todos"),
        ("PUT", rf"/todos/{_ID}", "write:todos"),
        ("POST", rf"/todos/{_ID}/restore", "write:todos"),
        ("POST", rf"/todos/{_ID}/subtodos", "write:todos"),
        ("PUT", rf"/subtodos/{_ID}", "write:todos"),
        # write:persons — handler additionally restricts fields for token auth
        ("PUT", rf"/persons/{_ID}", "write:persons"),
        ("POST", rf"/persons/{_ID}/check-in", "write:persons"),
        # write:notes — handlers additionally restrict to kind='personal'
        ("POST", r"/notes", "write:notes"),
        ("PUT", rf"/notes/{_ID}", "write:notes"),
        ("POST", rf"/notes/{_ID}/restore", "write:notes"),
        # write:daily
        ("PUT", rf"/daily-goals/{_DATE}", "write:daily"),
        ("POST", rf"/must-do/{_DATE}", "write:daily"),
        ("PUT", rf"/must-do/items/{_ID}", "write:daily"),
    )
]


def _bearer_required_scope(method: str, path: str) -> Optional[str]:
    for m, pat, scope in _BEARER_ROUTE_SCOPES:
        if m == method and pat.match(path):
            return scope
    return None


def _resolve_api_token(db: Session, raw: str):
    """Return (user, scopes, token_id) for a valid, unexpired, unrevoked token, else (None, [], None)."""
    if not raw.startswith(API_TOKEN_PREFIX):
        return None, [], None
    row = db.query(ApiToken).filter(ApiToken.token_hash == _hash_token(raw)).first()
    if not row or row.revoked_at:
        return None, [], None
    now = datetime.now(timezone.utc)
    if _parse_iso(row.expires_at) <= now:
        return None, [], None
    scopes = [s for s in row.scopes.split(",") if s]
    token_id = row.id
    # Commit before loading the user: commit expires loaded attributes, and the
    # expunged user must stay readable after this session closes.
    if not row.last_used_at or now - _parse_iso(row.last_used_at) > API_TOKEN_USED_REFRESH:
        row.last_used_at = now.isoformat()
        db.commit()
    user = db.query(User).filter(User.id == row.user_id, User.is_active == True).first()
    if not user:
        return None, [], None
    db.expunge(user)
    return user, scopes, token_id


def _record_api_audit(token_id: int, method: str, path: str, status: int, body: bytes) -> None:
    text_body = body.decode("utf-8", errors="replace")[:API_AUDIT_BODY_MAX]
    try:
        with SessionLocal() as db:
            db.add(
                ApiAudit(
                    token_id=token_id,
                    ts=datetime.now(timezone.utc).isoformat(),
                    method=method,
                    path=path,
                    status=status,
                    body=text_body,
                )
            )
            db.commit()
    except Exception:
        logger.exception("failed to write api audit row")


def _is_token_auth(request: Request) -> bool:
    return getattr(request.state, "auth_kind", None) == "token"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _rate_limited(bucket: dict, ip: str, max_failures: int, window: int) -> bool:
    now_mono = time.monotonic()
    failures = bucket[ip]
    while failures and now_mono - failures[0] > window:
        failures.popleft()
    return len(failures) >= max_failures


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def _parse_iso(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _resolve_session(db: Session, token: Optional[str]):
    """Return (user, refreshed) for a valid session token, else (None, False)."""
    if not token:
        return None, False
    sess = db.query(AuthSession).filter(AuthSession.token_hash == _hash_token(token)).first()
    if not sess:
        return None, False
    now = datetime.now(timezone.utc)
    if _parse_iso(sess.expires_at) <= now:
        db.delete(sess)
        db.commit()
        return None, False
    refreshed = False
    if now - _parse_iso(sess.last_seen_at) > SESSION_REFRESH_INTERVAL:
        sess.last_seen_at = now.isoformat()
        sess.expires_at = (now + SESSION_TTL).isoformat()
        db.commit()
        refreshed = True
    user = db.query(User).filter(User.id == sess.user_id, User.is_active == True).first()
    if not user:
        return None, False
    db.expunge(user)  # keep attributes readable after the session closes
    return user, refreshed


@app.middleware("http")
async def require_auth(request: Request, call_next):
    # Under the production /api mount, scope["path"] keeps the full path and the
    # mount prefix lands in root_path — strip it so PUBLIC_PATHS matches in both
    # dev (no mount) and prod.
    path = request.scope["path"]
    root_path = request.scope.get("root_path", "")
    if root_path and path.startswith(root_path):
        path = path[len(root_path):] or "/"
    if (
        request.method == "OPTIONS"
        or path in PUBLIC_PATHS
        or path in MCP_PUBLIC_PATHS
        or path.startswith("/.well-known/")
    ):
        return await call_next(request)
    # Bearer branch: an Authorization header means token auth, never cookie
    # auth. No ambient credential is involved, so the Origin check is skipped;
    # the scope table is the guard instead (deny-by-default).
    auth_header = request.headers.get("authorization")
    if auth_header:
        ip = _client_ip(request)
        if _rate_limited(_bearer_failures, ip, BEARER_MAX_FAILURES, BEARER_WINDOW_SECONDS):
            return JSONResponse(
                {"detail": "Too many invalid tokens. Try again later."},
                status_code=429,
                headers={"Retry-After": str(BEARER_WINDOW_SECONDS)},
            )
        scheme, _, raw = auth_header.partition(" ")
        user, scopes, token_id = None, [], None
        if scheme.lower() == "bearer" and raw.strip():
            with SessionLocal() as db:
                user, scopes, token_id = _resolve_api_token(db, raw.strip())
        if user is None:
            _bearer_failures[ip].append(time.monotonic())
            return JSONResponse({"detail": "Invalid or expired API token"}, status_code=401)
        needed = _bearer_required_scope(request.method, path)
        if needed is None or needed not in scopes:
            # Denied attempts are audited too: an agent probing beyond its
            # scopes is exactly what the user wants to see.
            if request.method not in ("GET", "HEAD"):
                _record_api_audit(token_id, request.method, path, 403, await request.body())
            if needed is None:
                return JSONResponse(
                    {"detail": f"{request.method} {path} is not available to API tokens"},
                    status_code=403,
                )
            return JSONResponse(
                {"detail": f"Token lacks required scope '{needed}'", "required_scope": needed},
                status_code=403,
            )
        request.state.user = user
        request.state.auth_kind = "token"
        request.state.token_scopes = scopes
        request.state.token_id = token_id
        if request.method in ("GET", "HEAD"):
            return await call_next(request)
        # Starlette caches the body, so the handler can still read it.
        body = await request.body()
        response = await call_next(request)
        _record_api_audit(token_id, request.method, path, response.status_code, body)
        return response
    # CSRF backstop on top of SameSite=Lax: mutating cross-origin requests are
    # rejected even if a cookie somehow rides along.
    if request.method not in ("GET", "HEAD"):
        origin = request.headers.get("origin")
        if origin and origin not in _cors_origins:
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    token = request.cookies.get(SESSION_COOKIE)
    with SessionLocal() as db:
        user, refreshed = _resolve_session(db, token)
    if user is None:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    request.state.user = user
    request.state.auth_kind = "session"
    response = await call_next(request)
    if refreshed:
        _set_session_cookie(response, token)
    return response


def get_current_user(request: Request) -> User:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(401, "Not authenticated")
    return user


class LoginIn(BaseModel):
    username: str
    password: str


class AuthUserOut(BaseModel):
    id: int
    username: str


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/auth/login", response_model=AuthUserOut)
def auth_login(
    data: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    ip = _client_ip(request)
    now_mono = time.monotonic()
    failures = _login_failures[ip]
    if _rate_limited(_login_failures, ip, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS):
        raise HTTPException(
            429,
            "Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(LOGIN_WINDOW_SECONDS)},
        )

    user = db.query(User).filter(User.username == data.username).first()
    try:
        _password_hasher.verify(user.password_hash if user else _DUMMY_HASH, data.password)
        ok = user is not None and user.is_active
    except VerifyMismatchError:
        ok = False
    if not ok:
        failures.append(now_mono)
        time.sleep(0.5)
        raise HTTPException(401, "Invalid username or password")

    if _password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = _password_hasher.hash(data.password)

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=_hash_token(token),
            created_at=now.isoformat(),
            last_seen_at=now.isoformat(),
            expires_at=(now + SESSION_TTL).isoformat(),
            user_agent=(request.headers.get("user-agent") or "")[:300],
        )
    )
    db.commit()
    _set_session_cookie(response, token)
    return {"id": user.id, "username": user.username}


@app.post("/auth/logout")
def auth_logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.query(AuthSession).filter(AuthSession.token_hash == _hash_token(token)).delete(
            synchronize_session=False
        )
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/auth/me", response_model=AuthUserOut)
def auth_me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username}


# ─── API tokens (management is cookie-session-only; see _BEARER_ROUTE_SCOPES) ──


class ApiTokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    scopes: List[str] = Field(..., min_length=1)
    expires_in_days: int = Field(API_TOKEN_DEFAULT_DAYS, ge=1, le=API_TOKEN_MAX_DAYS)


class ApiTokenOut(BaseModel):
    id: int
    name: str
    scopes: List[str]
    created_at: str
    expires_at: str
    last_used_at: Optional[str] = None
    revoked_at: Optional[str] = None


class ApiTokenCreated(ApiTokenOut):
    token: str  # shown exactly once


def _api_token_out(t: ApiToken) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "scopes": [s for s in t.scopes.split(",") if s],
        "created_at": t.created_at,
        "expires_at": t.expires_at,
        "last_used_at": t.last_used_at,
        "revoked_at": t.revoked_at,
    }


@app.get("/api-tokens", response_model=List[ApiTokenOut])
def list_api_tokens(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(ApiToken).filter(ApiToken.user_id == user.id).order_by(ApiToken.id.desc()).all()
    return [_api_token_out(t) for t in rows]


@app.post("/api-tokens", response_model=ApiTokenCreated)
def create_api_token(
    data: ApiTokenCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    bad = sorted(set(data.scopes) - set(API_TOKEN_SCOPES))
    if bad:
        raise HTTPException(422, f"Unknown scopes: {', '.join(bad)}. Valid: {', '.join(API_TOKEN_SCOPES)}")
    scopes = [s for s in API_TOKEN_SCOPES if s in data.scopes]
    raw = API_TOKEN_PREFIX + secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    row = ApiToken(
        user_id=user.id,
        name=data.name.strip(),
        token_hash=_hash_token(raw),
        scopes=",".join(scopes),
        created_at=now.isoformat(),
        expires_at=(now + timedelta(days=data.expires_in_days)).isoformat(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {**_api_token_out(row), "token": raw}


class ApiAuditOut(BaseModel):
    id: int
    ts: str
    method: str
    path: str
    status: int
    body: str


@app.get("/api-tokens/{token_id}/audit", response_model=List[ApiAuditOut])
def api_token_audit(
    token_id: int,
    limit: int = Query(50, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Most recent mutating requests made with this token, newest first."""
    tok = db.query(ApiToken).filter(ApiToken.id == token_id, ApiToken.user_id == user.id).first()
    if not tok:
        raise HTTPException(404, "Token not found")
    rows = (
        db.query(ApiAudit)
        .filter(ApiAudit.token_id == token_id)
        .order_by(ApiAudit.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {"id": r.id, "ts": r.ts, "method": r.method, "path": r.path, "status": r.status, "body": r.body or ""}
        for r in rows
    ]


@app.delete("/api-tokens/{token_id}", response_model=ApiTokenOut)
def revoke_api_token(
    token_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    row = db.query(ApiToken).filter(ApiToken.id == token_id, ApiToken.user_id == user.id).first()
    if not row:
        raise HTTPException(404, "Token not found")
    if not row.revoked_at:
        row.revoked_at = datetime.now(timezone.utc).isoformat()
        db.commit()
        db.refresh(row)
    return _api_token_out(row)


# ─── Agent surface ───────────────────────────────────────────────────────────

AGENT_MANUAL_PATH = Path(__file__).parent / "agent_manual.md"


@app.get("/agent/manual", summary="Operator manual for agents (markdown)")
def agent_manual():
    """The living manual describing how an agent should operate this API.

    Served from the deployed code so what an agent reads always matches the
    API it is calling. `X-Manual-Version` is a content hash for change detection.
    """
    try:
        body = AGENT_MANUAL_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise HTTPException(404, "agent_manual.md is missing from this deployment")
    version = hashlib.sha256(body.encode()).hexdigest()[:12]
    return PlainTextResponse(
        body,
        media_type="text/markdown; charset=utf-8",
        headers={"X-Manual-Version": version, "Cache-Control": "no-store"},
    )


OPERATOR_SKILL_DIR = Path(__file__).parent.parent / "tools" / "operator-skill"


@app.get("/agent/skill", summary="Operator bootstrap skill as a .tar.gz")
def agent_skill():
    """Tarball of tools/operator-skill/: one folder per Claude Code skill
    (mgmt-operator with the `mgmt` and `report` helpers, daily-report,
    weekly-report, checkins).

    Unpack into ~/.claude/skills/ on a new device:
    `curl -H "Authorization: Bearer $T" .../agent/skill | tar xz -C ~/.claude/skills/`
    """
    if not OPERATOR_SKILL_DIR.is_dir():
        raise HTTPException(404, "operator skill is missing from this deployment")
    import tarfile

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for skill_dir in sorted(OPERATOR_SKILL_DIR.iterdir()):
            if not skill_dir.is_dir() or skill_dir.name.startswith("."):
                continue
            for f in sorted(skill_dir.iterdir()):
                if f.is_file() and not f.name.startswith("."):
                    tar.add(f, arcname=f"{skill_dir.name}/{f.name}")
    return Response(
        buf.getvalue(),
        media_type="application/gzip",
        headers={
            "Content-Disposition": 'attachment; filename="mgmt-operator.tar.gz"',
            "Cache-Control": "no-store",
        },
    )


@app.get("/agent/digest", summary="Everything an agent needs to plan the day, in one call")
def agent_digest(db: Session = Depends(get_db)):
    """Focused/overdue/due-today todos, overdue check-ins, today's must-do and goal, recently done.

    Read-only: unlike GET /must-do/{date} this does not carry items over.
    """
    today = today_in_user_tz()
    week_ago = (date.fromisoformat(today) - timedelta(days=7)).isoformat()
    open_q = db.query(Todo).filter(Todo.deleted_at == None, Todo.status != "done")

    focused = open_q.filter(Todo.is_focused == True).order_by(Todo.focus_order, Todo.id).all()
    overdue = open_q.filter(Todo.deadline != None, Todo.deadline < today).order_by(Todo.deadline).all()
    due_today = open_q.filter(Todo.deadline == today).order_by(Todo.importance.desc(), Todo.id).all()
    recently_done = (
        db.query(Todo)
        .filter(Todo.status == "done", Todo.deleted_at == None, Todo.done_at >= week_ago)
        .order_by(nullslast(Todo.done_at.desc()))
        .limit(30)
        .all()
    )

    today_d = date.fromisoformat(today)
    overdue_check_ins = []
    for p in (
        db.query(Person)
        .filter(Person.deleted_at == None, Person.is_direct_report == True)
        .order_by(Person.display_order, Person.id)
        .all()
    ):
        interval = p.check_in_interval_days or DEFAULT_CHECK_IN_INTERVAL_DAYS
        if p.last_check_in_date:
            days_since = (today_d - date.fromisoformat(p.last_check_in_date)).days
        else:
            days_since = None
        if days_since is None or days_since > interval:
            overdue_check_ins.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "last_check_in_date": p.last_check_in_date,
                    "check_in_interval_days": interval,
                    "days_since_check_in": days_since,
                }
            )

    must_do = db.query(MustDoItem).filter(MustDoItem.date == today).order_by(MustDoItem.order).all()
    goal = db.query(DailyGoal).filter(DailyGoal.date == today).first()

    return {
        "today": today,
        "focused_todos": [todo_to_out(t) for t in focused],
        "overdue_todos": [todo_to_out(t) for t in overdue],
        "due_today_todos": [todo_to_out(t) for t in due_today],
        "overdue_check_ins": overdue_check_ins,
        "must_do_today": [MustDoItemOut.model_validate(m) for m in must_do],
        "daily_goal_today": DailyGoalOut.model_validate(goal) if goal else None,
        "recently_done": [todo_to_out(t) for t in recently_done],
    }


# ─── Persons ─────────────────────────────────────────────────────────────────


@app.get("/persons", response_model=List[PersonOut])
def list_persons(db: Session = Depends(get_db)):
    rows = (
        db.query(Person)
        .filter(Person.deleted_at == None)
        .order_by(Person.display_order, Person.id)
        .all()
    )
    return [person_to_out(p) for p in rows]


@app.get("/persons/deleted", response_model=List[PersonOut])
def list_deleted_persons(db: Session = Depends(get_db)):
    rows = (
        db.query(Person)
        .filter(Person.deleted_at != None)
        .order_by(Person.deleted_at.desc())
        .all()
    )
    return [person_to_out(p) for p in rows]


@app.post("/persons", response_model=PersonOut)
def create_person(data: PersonCreate, db: Session = Depends(get_db)):
    max_order = (
        db.query(Person.display_order)
        .filter(Person.deleted_at == None)
        .order_by(Person.display_order.desc())
        .limit(1)
        .scalar()
    ) or 0
    payload = data.model_dump(exclude={"project_ids"})
    p = Person(**payload, display_order=max_order + 1)
    db.add(p)
    db.flush()
    if data.project_ids is not None:
        _set_person_projects(db, p.id, data.project_ids)
    db.commit()
    db.refresh(p)
    return person_to_out(p)


@app.put("/persons/reorder")
def reorder_persons(items: List[PersonOrderItem], db: Session = Depends(get_db)):
    for item in items:
        p = db.query(Person).get(item.id)
        if p:
            p.display_order = item.display_order
    db.commit()
    return {"ok": True}


TOKEN_PERSON_FIELDS = {"last_check_in_date", "notes"}


@app.put("/persons/{person_id}", response_model=PersonOut)
def update_person(
    person_id: int, data: PersonUpdate, request: Request, db: Session = Depends(get_db)
):
    p = db.query(Person).get(person_id)
    if not p:
        raise HTTPException(404, "Person not found")
    payload = data.model_dump(exclude_unset=True)
    if _is_token_auth(request):
        extra = sorted(set(payload) - TOKEN_PERSON_FIELDS)
        if extra:
            raise HTTPException(
                403,
                f"API tokens may only update {sorted(TOKEN_PERSON_FIELDS)} on a person; got {extra}",
            )
    project_ids = payload.pop("project_ids", None)
    for k, v in payload.items():
        setattr(p, k, v)
    if project_ids is not None:
        _set_person_projects(db, person_id, project_ids)
    db.commit()
    db.refresh(p)
    return person_to_out(p)


class CheckInIn(BaseModel):
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


@app.post("/persons/{person_id}/check-in", response_model=PersonOut, summary="Record a check-in (forward-only)")
def check_in_person(person_id: int, data: Optional[CheckInIn] = None, db: Session = Depends(get_db)):
    """Advance last_check_in_date to `date` (default: today in the user's
    timezone). Older dates are ignored, so this is safe to call repeatedly."""
    p = db.query(Person).get(person_id)
    if not p or p.deleted_at:
        raise HTTPException(404, "Person not found")
    new_date = (data.date if data and data.date else None) or today_in_user_tz()
    if p.last_check_in_date is None or new_date > p.last_check_in_date:
        p.last_check_in_date = new_date
        db.commit()
        db.refresh(p)
    return person_to_out(p)


@app.delete("/persons/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db)):
    p = db.query(Person).get(person_id)
    if not p:
        raise HTTPException(404, "Person not found")
    if p.deleted_at is None:
        p.deleted_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True}


@app.post("/persons/{person_id}/restore")
def restore_person(person_id: int, db: Session = Depends(get_db)):
    p = db.query(Person).get(person_id)
    if not p:
        raise HTTPException(404, "Person not found")
    p.deleted_at = None
    db.commit()
    return {"ok": True}


@app.delete("/persons/{person_id}/purge")
def purge_person(person_id: int, db: Session = Depends(get_db)):
    p = db.query(Person).get(person_id)
    if not p:
        raise HTTPException(404, "Person not found")
    if p.deleted_at is None:
        raise HTTPException(400, "Person is not archived")
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
    return (
        db.query(Project)
        .filter(Project.deleted_at == None)
        .order_by(Project.display_order, Project.id)
        .all()
    )


@app.get("/projects/tree", response_model=List[ProjectTreeOut])
def projects_tree(db: Session = Depends(get_db)):
    roots = (
        db.query(Project)
        .filter(Project.parent_id == None, Project.deleted_at == None)
        .order_by(Project.display_order, Project.id)
        .all()
    )
    return [project_to_tree(r) for r in roots]


@app.post("/projects", response_model=ProjectOut)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    payload = data.model_dump(exclude_none=True)
    importance = payload.get("importance")
    if importance is not None and importance not in PROJECT_IMPORTANCE_VALUES:
        raise HTTPException(400, f"importance must be one of {sorted(PROJECT_IMPORTANCE_VALUES)}")
    p = Project(**payload)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.put("/projects/reorder")
def reorder_projects(items: List[ProjectOrderItem], db: Session = Depends(get_db)):
    for item in items:
        p = db.query(Project).get(item.id)
        if p:
            p.display_order = item.display_order
    db.commit()
    return {"ok": True}


@app.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    payload = data.model_dump(exclude_none=True)
    if "importance" in payload and payload["importance"] not in PROJECT_IMPORTANCE_VALUES:
        raise HTTPException(400, f"importance must be one of {sorted(PROJECT_IMPORTANCE_VALUES)}")
    for k, v in payload.items():
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
def recently_done_todos(
    limit: int = Query(50),
    since: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Todo).filter(Todo.status == "done", Todo.deleted_at == None)
    if since is not None:
        q = q.filter(Todo.done_at >= since.isoformat())
    todos = (
        q.order_by(nullslast(Todo.done_at.desc()), Todo.created_at.desc())
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


class FocusListIn(BaseModel):
    todo_ids: List[int] = Field(..., max_length=30)


@app.put("/todos/focus", response_model=List[TodoOut], summary="Set the whole focus list in one call")
def set_focus_list(data: FocusListIn, db: Session = Depends(get_db)):
    """The given ids become the focus list, in this order; every other open
    todo is unfocused. Idempotent. Returns the resulting focus list."""
    ids = list(dict.fromkeys(data.todo_ids))  # dedupe, keep order
    todos = {t.id: t for t in db.query(Todo).filter(Todo.id.in_(ids), Todo.deleted_at == None).all()} if ids else {}
    missing = [i for i in ids if i not in todos]
    if missing:
        raise HTTPException(404, f"Todo ids not found: {missing}")
    for t in db.query(Todo).filter(Todo.is_focused == True, Todo.deleted_at == None).all():
        if t.id not in todos:
            t.is_focused = False
            t.focus_order = 0
    for order, i in enumerate(ids):
        todos[i].is_focused = True
        todos[i].focus_order = order
    db.commit()
    result = (
        db.query(Todo)
        .filter(Todo.is_focused == True, Todo.deleted_at == None)
        .order_by(Todo.focus_order, Todo.id)
        .all()
    )
    return [todo_to_out(t) for t in result]


@app.get("/todos/{todo_id}", response_model=TodoOut)
def get_todo(todo_id: int, db: Session = Depends(get_db)):
    t = db.query(Todo).get(todo_id)
    if not t:
        raise HTTPException(404, "Todo not found")
    return todo_to_out(t)


DEPRECATED_STATUSES = {"in_progress", "in-progress"}


@app.post("/todos", response_model=TodoOut)
def create_todo(data: TodoCreate, db: Session = Depends(get_db)):
    if data.status in DEPRECATED_STATUSES:
        raise HTTPException(400, "Status 'in-progress' is deprecated; use 'todo'")
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
    if update_data.get("status") in DEPRECATED_STATUSES:
        raise HTTPException(400, "Status 'in-progress' is deprecated; use 'todo'")
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



# ─── Vaults (Phase 4) ──────────────────────────────────────────────────────


def _vault_to_out(v: Vault, db: Session) -> VaultOut:
    count = db.query(Note).filter(Note.vault_id == v.id, Note.hidden == False).count()
    return VaultOut(
        id=v.id,
        name=v.name,
        root_path=v.root_path,
        is_managed=v.is_managed,
        created_at=v.created_at,
        last_scan_at=v.last_scan_at,
        note_count=count,
    )


@app.get("/vaults", response_model=List[VaultOut])
def list_vaults(db: Session = Depends(get_db)):
    return [_vault_to_out(v, db) for v in db.query(Vault).order_by(Vault.is_managed.desc(), Vault.name).all()]


@app.post("/vaults", response_model=VaultOut)
def create_vault(data: VaultCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Vault name is required")
    path = Path(data.root_path).expanduser().resolve()
    if VAULTS_ROOT is not None and not path.is_relative_to(VAULTS_ROOT):
        raise HTTPException(400, f"Vault path must be under {VAULTS_ROOT}")
    if not path.exists() or not path.is_dir():
        raise HTTPException(400, f"Path does not exist or is not a directory: {path}")
    if db.query(Vault).filter(Vault.name == name).first():
        raise HTTPException(400, f"Vault name '{name}' already exists")
    if db.query(Vault).filter(Vault.root_path == str(path)).first():
        raise HTTPException(400, f"A vault already points at {path}")
    v = Vault(name=name, root_path=str(path), is_managed=False)
    db.add(v)
    db.commit()
    db.refresh(v)
    _scan_vault(db, v)
    return _vault_to_out(v, db)


@app.delete("/vaults/{vault_id}")
def delete_vault(vault_id: int, db: Session = Depends(get_db)):
    v = db.query(Vault).get(vault_id)
    if not v:
        raise HTTPException(404, "Vault not found")
    if v.is_managed:
        raise HTTPException(400, "Cannot delete the managed vault")
    # Drop the index rows; files on disk are not touched.
    db.query(Note).filter(Note.vault_id == v.id).delete(synchronize_session=False)
    db.delete(v)
    db.commit()
    return {"ok": True}


@app.post("/vaults/{vault_id}/rescan", response_model=VaultOut)
def rescan_vault(vault_id: int, db: Session = Depends(get_db)):
    v = db.query(Vault).get(vault_id)
    if not v:
        raise HTTPException(404, "Vault not found")
    stats = _scan_vault(db, v)
    db.refresh(v)
    out = _vault_to_out(v, db)
    log.info("Manual rescan vault id=%d stats=%s", vault_id, stats)
    return out


# ─── Notes (unified personal + meeting note model) ──────────────────────────


def _search_notes(db: Session, q: str, kind: Optional[str], hidden: bool) -> List[NoteSearchResult]:
    q_lower = q.lower()
    query = (
        db.query(Note)
        .options(joinedload(Note.meeting_details))
        .filter(Note.hidden == hidden)
    )
    if kind is not None:
        query = query.filter(Note.kind == kind)
    notes = query.order_by(Note.updated_at.desc()).all()
    results: List[NoteSearchResult] = []
    for n in notes:
        date = n.meeting_details.date if n.meeting_details else None
        content = _read_note_body(n)
        matched = False
        for i, line in enumerate(content.splitlines()):
            if q_lower in line.lower():
                lines = content.splitlines()
                start = max(0, i - 1)
                end = min(len(lines), i + 2)
                snippet = "\n".join(lines[start:end])
                results.append(NoteSearchResult(id=n.id, title=n.title, kind=n.kind, snippet=snippet, date=date))
                matched = True
                break
        if not matched and q_lower in n.title.lower():
            results.append(NoteSearchResult(id=n.id, title=n.title, kind=n.kind, snippet="", date=date))
    return results


@app.get("/notes/search", response_model=List[NoteSearchResult])
def search_notes(
    q: str = Query(..., min_length=1),
    kind: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return _search_notes(db, q, kind, hidden=False)


@app.get("/notes-hidden", response_model=List[NoteSummary])
def list_hidden_notes(
    kind: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    _scan_all_vaults_if_stale(db)
    q = db.query(Note).options(joinedload(Note.tags)).filter(Note.hidden == True)
    if kind is not None:
        q = q.filter(Note.kind == kind)
    return [note_to_summary(n) for n in q.order_by(Note.updated_at.desc()).all()]


@app.get("/notes-hidden/search", response_model=List[NoteSearchResult])
def search_hidden_notes(
    q: str = Query(..., min_length=1),
    kind: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return _search_notes(db, q, kind, hidden=True)


@app.get("/notes", response_model=List[NoteSummary])
def list_notes(
    kind: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    person_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    todo_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    vault_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    _scan_all_vaults_if_stale(db)
    q = (
        db.query(Note)
        .options(
            joinedload(Note.tags),
            joinedload(Note.attendees),
            joinedload(Note.projects),
            joinedload(Note.todos),
            joinedload(Note.meeting_details),
        )
        .filter(Note.hidden == False)
    )
    if kind is not None:
        q = q.filter(Note.kind == kind)
    if tag is not None:
        tag_lower = tag.lower()
        q = q.filter(
            Note.tags.any(or_(Tag.name == tag_lower, Tag.name.like(tag_lower + "/%")))
        )
    if person_id is not None:
        q = q.filter(Note.attendees.any(Person.id == person_id))
    if project_id is not None:
        q = q.filter(Note.projects.any(Project.id == project_id))
    if todo_id is not None:
        q = q.filter(Note.todos.any(Todo.id == todo_id))
    if date_from is not None:
        q = q.filter(Note.meeting_details.has(MeetingDetails.date >= date_from))
    if date_to is not None:
        q = q.filter(Note.meeting_details.has(MeetingDetails.date <= date_to))
    if vault_id is not None:
        q = q.filter(Note.vault_id == vault_id)
    # Meeting notes sort by meeting date (desc) when filtering kind=meeting; otherwise by updated_at desc.
    if kind == "meeting":
        notes = q.outerjoin(Note.meeting_details).order_by(
            nullslast(MeetingDetails.date.desc()), Note.updated_at.desc()
        ).all()
    else:
        notes = q.order_by(Note.updated_at.desc()).all()
    return [note_to_summary(n) for n in notes]


# ─── Tags ───────────────────────────────────────────────────────────────────


@app.get("/tags", response_model=List[TagOut])
def list_tags(
    kind: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    _scan_all_vaults_if_stale(db)
    q = (
        db.query(Tag.name, func.count(func.distinct(Note.id)))
        .join(note_tags, Tag.id == note_tags.c.tag_id)
        .join(Note, Note.id == note_tags.c.note_id)
        .filter(Note.hidden == False)
    )
    if kind is not None:
        q = q.filter(Note.kind == kind)
    rows = q.group_by(Tag.name).order_by(Tag.name).all()
    return [TagOut(name=name, note_count=count) for name, count in rows]


@app.get("/notes/{note_id}", response_model=NoteOut)
def get_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    return note_to_out(n)


@app.post("/notes", response_model=NoteOut)
def create_note(data: NoteCreate, request: Request, db: Session = Depends(get_db)):
    if _is_token_auth(request) and data.kind != "personal":
        raise HTTPException(403, "API tokens may only create notes with kind='personal'")
    if data.kind == "meeting" and not data.date:
        raise HTTPException(400, "Meeting notes require a 'date'")

    # Resolve target vault (defaults to managed vault).
    if data.vault_id is not None:
        vault = db.query(Vault).get(data.vault_id)
        if not vault:
            raise HTTPException(404, f"Vault {data.vault_id} not found")
    else:
        vault = db.query(Vault).filter(Vault.is_managed == True).first()
        if not vault:
            raise HTTPException(500, "Managed vault missing (lifespan should create it)")
    _require_accessible_vault(vault)

    # Body: explicit content wins; otherwise pull from template (meeting kind only)
    body = data.content or ""
    if not body and data.template:
        if not re.fullmatch(r"[A-Za-z0-9 _\-]+", data.template):
            raise HTTPException(400, "Invalid template name")
        tmpl_path = (MEETING_TEMPLATES_DIR / f"{data.template}.md").resolve()
        if not tmpl_path.is_relative_to(MEETING_TEMPLATES_DIR.resolve()):
            raise HTTPException(400, "Invalid template name")
        if tmpl_path.exists():
            body = tmpl_path.read_text(encoding="utf-8")

    n = Note(
        title=data.title,
        kind=data.kind,
        vault_id=vault.id,
        filename=f"__placeholder_{uuid.uuid4().hex}__",
    )
    db.add(n)
    db.flush()
    # Human-readable filename derived from the title, with collision fallback.
    stem = _slugify_title_for_filename(data.title) or f"Untitled-{n.id}"
    new_rel = _resolve_unique_filename(Path(vault.root_path), "", stem, None)
    n.filename = Path(new_rel).name
    n.relative_path = new_rel
    n.mgmt_id = str(uuid.uuid4())

    # Write file with mgmt_id frontmatter stamped.
    path = _note_path(n)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        _serialize_with_frontmatter({"mgmt_id": n.mgmt_id}, body),
        encoding="utf-8",
    )
    st = path.stat()
    n.mtime = st.st_mtime
    n.size = st.st_size
    n.last_indexed_at = datetime.now(timezone.utc).isoformat()

    sync_tags_for_note(db, n, body)

    if data.kind == "meeting" and data.date:
        db.add(MeetingDetails(note_id=n.id, date=data.date))
    if data.attendee_ids:
        n.attendees = db.query(Person).filter(Person.id.in_(data.attendee_ids)).all()
    if data.project_ids:
        n.projects = db.query(Project).filter(Project.id.in_(data.project_ids)).all()
    if data.todo_ids:
        n.todos = db.query(Todo).filter(Todo.id.in_(data.todo_ids)).all()

    _bump_check_ins_for_meeting(n, data.date)

    db.commit()
    db.refresh(n)
    return note_to_out(n)


@app.put("/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: int, data: NoteUpdate, request: Request, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    update_data = data.model_dump(exclude_unset=True)
    if _is_token_auth(request):
        if n.kind != "personal":
            raise HTTPException(403, "API tokens may only edit notes with kind='personal'")
        if "transcript" in update_data:
            raise HTTPException(403, "API tokens may not edit transcripts")
    content = update_data.pop("content", None)
    new_date = update_data.pop("date", None)
    attendee_ids = update_data.pop("attendee_ids", None)
    project_ids = update_data.pop("project_ids", None)
    todo_ids = update_data.pop("todo_ids", None)
    transcript = update_data.pop("transcript", None)

    title_changed = "title" in update_data and isinstance(update_data["title"], str)
    for k, v in update_data.items():
        setattr(n, k, v)
    if content is not None:
        _write_note_body(n, content)
        sync_tags_for_note(db, n, content)
    if new_date is not None:
        if n.meeting_details is None:
            db.add(MeetingDetails(note_id=n.id, date=new_date))
        else:
            n.meeting_details.date = new_date
    if attendee_ids is not None:
        n.attendees = db.query(Person).filter(Person.id.in_(attendee_ids)).all()
    if project_ids is not None:
        n.projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
    if todo_ids is not None:
        n.todos = db.query(Todo).filter(Todo.id.in_(todo_ids)).all()
    # Run unconditionally for meeting notes so editing either the date or the
    # attendee list refreshes the roster's check-in watermarks.
    _bump_check_ins_for_meeting(
        n, new_date if new_date is not None else (n.meeting_details.date if n.meeting_details else None)
    )
    if transcript is not None:
        _write_transcript(n.id, transcript)

    # Rename the on-disk file to match the new title.
    # Preserves the current subdirectory; only the basename changes.
    if title_changed and n.vault and n.relative_path:
        _require_accessible_vault(n.vault)
        stem = _slugify_title_for_filename(n.title)
        if stem:
            vault_root = Path(n.vault.root_path)
            current_dir = str(Path(n.relative_path).parent)
            if current_dir == ".":
                current_dir = ""
            new_rel = _resolve_unique_filename(vault_root, current_dir, stem, n.relative_path)
            if new_rel != n.relative_path:
                old_full = vault_root / n.relative_path
                new_full = vault_root / new_rel
                new_full.parent.mkdir(parents=True, exist_ok=True)
                if old_full.exists():
                    old_full.rename(new_full)
                n.relative_path = new_rel
                n.filename = Path(new_rel).name
                if new_full.exists():
                    st = new_full.stat()
                    n.mtime = st.st_mtime
                    n.size = st.st_size

    n.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(n)
    return note_to_out(n)


@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    n.hidden = True
    n.updated_at = datetime.now(timezone.utc).isoformat()
    try:
        _update_note_frontmatter(
            n,
            patch={
                "mgmt_status": "trashed",
                "mgmt_trashed_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        st = _note_path(n).stat()
        n.mtime = st.st_mtime
        n.size = st.st_size
    except FileNotFoundError:
        pass  # file was already gone; DB flag suffices
    db.commit()
    return {"ok": True}


@app.post("/notes/{note_id}/restore")
def restore_note(note_id: int, request: Request, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    if _is_token_auth(request) and n.kind != "personal":
        raise HTTPException(403, "API tokens may only restore notes with kind='personal'")
    n.hidden = False
    n.updated_at = datetime.now(timezone.utc).isoformat()
    try:
        _update_note_frontmatter(n, patch={}, remove_keys={"mgmt_status", "mgmt_trashed_at"})
        st = _note_path(n).stat()
        n.mtime = st.st_mtime
        n.size = st.st_size
    except FileNotFoundError:
        pass
    db.commit()
    return {"ok": True}


@app.delete("/notes/{note_id}/purge")
def purge_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    if not n.hidden:
        raise HTTPException(400, "Note is not soft-deleted")
    path = _note_path(n)
    # Defensive: only unlink inside the vault root, never outside it
    if n.vault and path.exists():
        try:
            path.resolve().relative_to(Path(n.vault.root_path).resolve())
            path.unlink()
        except ValueError:
            pass  # path escapes vault root; leave file alone
    db.delete(n)
    db.commit()
    return {"ok": True}


# Audio + transcribe + suggest-todos (rehomed from /meeting-notes/{id}/...)


MAX_AUDIO_UPLOAD_MB = int(os.environ.get("MAX_AUDIO_UPLOAD_MB", "300"))
# Only a demuxer hint for ffmpeg — everything is transcoded to mp3 regardless.
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".mp4", ".m4a", ".mp3", ".wav", ".ogg"}


@app.post("/notes/{note_id}/audio")
async def upload_note_audio(note_id: int, file: UploadFile, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    audio_dir = MEETING_AUDIO_DIR / str(note_id)
    audio_dir.mkdir(exist_ok=True)
    tmp_name = f"{uuid.uuid4().hex}_raw"
    raw_ext = Path(file.filename or "recording.webm").suffix.lower()
    if raw_ext not in ALLOWED_AUDIO_EXTENSIONS:
        raw_ext = ".webm"
    raw_dest = audio_dir / f"{tmp_name}{raw_ext}"
    max_bytes = MAX_AUDIO_UPLOAD_MB * 1024 * 1024
    received = 0
    try:
        with open(raw_dest, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                received += len(chunk)
                if received > max_bytes:
                    raise HTTPException(413, f"Audio upload exceeds {MAX_AUDIO_UPLOAD_MB} MB limit")
                f.write(chunk)
    except HTTPException:
        raw_dest.unlink(missing_ok=True)
        raise
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


@app.get("/notes/{note_id}/audio", response_model=List[AudioFileInfo])
def list_note_audio(note_id: int, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    return _list_audio_files(note_id)


@app.delete("/notes/{note_id}/audio/{filename}")
def delete_note_audio(note_id: int, filename: str, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    path = MEETING_AUDIO_DIR / str(note_id) / filename
    if (
        not path.exists()
        or not path.resolve().is_relative_to(MEETING_AUDIO_DIR.resolve())
    ):
        raise HTTPException(404, "Audio file not found")
    path.unlink()
    parent = path.parent
    if parent.exists() and not any(parent.iterdir()):
        parent.rmdir()
    return {"ok": True}


@app.get("/notes/{note_id}/audio/{filename}/download")
def download_note_audio(note_id: int, filename: str, db: Session = Depends(get_db)):
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    path = MEETING_AUDIO_DIR / str(note_id) / filename
    if (
        not path.exists()
        or not path.resolve().is_relative_to(MEETING_AUDIO_DIR.resolve())
    ):
        raise HTTPException(404, "Audio file not found")
    media_type = "audio/mpeg" if path.suffix == ".mp3" else "audio/webm"
    return FileResponse(path, media_type=media_type)


@app.post("/notes/{note_id}/transcribe")
async def transcribe_note(
    note_id: int,
    filename: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if not openai_client:
        raise HTTPException(
            503,
            "OpenAI API key not configured. Set OPENAI_API_KEY in backend/.env.",
        )
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")

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
            raise HTTPException(404, "No audio files for this note")
        audio_paths = sorted(f for f in audio_dir.iterdir() if f.is_file())
        if not audio_paths:
            raise HTTPException(404, "No audio files for this note")

    segments = []
    try:
        for audio_path in audio_paths:
            file_size = audio_path.stat().st_size
            if file_size > 25 * 1024 * 1024:
                raise HTTPException(
                    413,
                    "Audio file too large to transcribe (>25 MB). "
                    "Chunked transcription is not implemented yet.",
                )
            with open(audio_path, "rb") as af:
                result = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=af,
                )
            segments.append(result.text)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Transcription failed for note %s", note_id)
        raise HTTPException(500, "Transcription failed")

    transcript = "\n\n".join(segments)
    _write_transcript(note_id, transcript)
    n.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"transcript": transcript}


@app.post("/notes/{note_id}/suggest-todos")
async def suggest_note_todos(note_id: int, db: Session = Depends(get_db)):
    if not openai_client:
        raise HTTPException(
            503,
            "OpenAI API key not configured. Set OPENAI_API_KEY in backend/.env.",
        )
    n = db.query(Note).get(note_id)
    if not n:
        raise HTTPException(404, "Note not found")

    content = _read_note_body(n)
    transcript = _read_transcript(n.id)

    parts = []
    if content.strip():
        parts.append(f"## Note\n{content}")
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
                    "You are a helpful assistant that extracts actionable todo items from notes and transcripts. "
                    "Return a JSON array of objects with 'title' (short actionable task title) and 'description' (brief context). "
                    "Only return concrete, actionable items. Return at most 10 items. "
                    "Return ONLY the JSON array, no other text."
                ),
            },
            {
                "role": "user",
                "content": f"Extract actionable todo items from the following content:\n\n{combined}",
            },
        ],
        temperature=0.3,
    )

    raw = (response.choices[0].message.content or "[]").strip()
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


# ─── Config (user settings shared with frontend) ─────────────────────────────


class TodoDefaultsPatch(BaseModel):
    assignee_name: Optional[str] = None
    deadline_to_today: Optional[bool] = None
    estimated_hours: Optional[str] = None
    importance: Optional[str] = None


class UserSettingsPatch(BaseModel):
    timezone: Optional[str] = None
    theme: Optional[str] = None
    theme_variant: Optional[str] = None
    font_size: Optional[str] = None
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
    if patch.font_size is not None and patch.font_size not in ("sm", "md", "lg", "xl"):
        raise HTTPException(400, f"Unknown font_size: {patch.font_size}")
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


# ─── Hosted MCP endpoint (see mcp_server.py) ─────────────────────────────────
# Imported last: mcp_server does `import main` and needs every model/handler
# above to exist. Routes are added here for local dev (main:app at the root);
# serve.py adds the same routes at the origin root in production.
import mcp_server  # noqa: E402

MCP_PUBLIC_PATHS.update(mcp_server.MCP_PUBLIC_PATHS)
for _route in mcp_server.MCP_ROUTES:
    app.router.routes.append(_route)
