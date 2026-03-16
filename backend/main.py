import math
from datetime import date, datetime
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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
    parent_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    deadline = Column(String, nullable=True)
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
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    done_at = Column(String, nullable=True)
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


Base.metadata.create_all(bind=engine)


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
    parent_id: Optional[int] = None
    deadline: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    deadline: Optional[str] = None
    model_config = {"from_attributes": True}


class ProjectTreeOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
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
    created_at: str
    done_at: Optional[str] = None
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


# ─── Helpers ─────────────────────────────────────────────────────────────────


def todo_to_out(t: Todo) -> TodoOut:
    return TodoOut(
        id=t.id,
        title=t.title,
        description=t.description,
        project_id=t.project_id,
        project_name=t.project.name if t.project else None,
        assignee_id=t.assignee_id,
        assignee_name=t.assignee.name if t.assignee else None,
        deadline=t.deadline,
        importance=t.importance,
        estimated_hours=t.estimated_hours,
        status=t.status,
        is_blocked=any(b.status != "done" for b in t.blocked_by),
        created_at=t.created_at,
        done_at=t.done_at,
        subtodos=[SubTodoOut.model_validate(s) for s in t.subtodos],
        blocked_by_ids=[b.id for b in t.blocked_by],
    )


def project_to_tree(p: Project) -> ProjectTreeOut:
    return ProjectTreeOut(
        id=p.id,
        name=p.name,
        description=p.description,
        parent_id=p.parent_id,
        deadline=p.deadline,
        subprojects=[project_to_tree(sp) for sp in p.subprojects],
    )


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="Management API")

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


# ─── Projects ────────────────────────────────────────────────────────────────


@app.get("/projects", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).all()


@app.get("/projects/tree", response_model=List[ProjectTreeOut])
def projects_tree(db: Session = Depends(get_db)):
    roots = db.query(Project).filter(Project.parent_id == None).all()
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


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    db.delete(p)
    db.commit()
    return {"ok": True}


# ─── Todos ───────────────────────────────────────────────────────────────────


@app.get("/todos", response_model=List[TodoOut])
def list_todos(
    assignee_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    exclude_done: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(Todo)
    if assignee_id is not None:
        q = q.filter(Todo.assignee_id == assignee_id)
    if project_id is not None:
        q = q.filter(Todo.project_id == project_id)
    if exclude_done:
        q = q.filter(Todo.status != "done")
    if status == "blocked":
        todos = [t for t in q.all() if any(b.status != "done" for b in t.blocked_by)]
    else:
        if status is not None:
            q = q.filter(Todo.status == status)
        todos = q.all()
    return [todo_to_out(t) for t in todos]


@app.get("/todos/recently-done", response_model=List[TodoOut])
def recently_done_todos(limit: int = Query(50), db: Session = Depends(get_db)):
    todos = (
        db.query(Todo)
        .filter(Todo.status == "done")
        .order_by(nullslast(Todo.done_at.desc()), Todo.created_at.desc())
        .limit(limit)
        .all()
    )
    return [todo_to_out(t) for t in todos]


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
            t.done_at = datetime.now().isoformat()
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
    todos = db.query(Todo).filter(Todo.deadline != None, Todo.status != "done").all()
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
