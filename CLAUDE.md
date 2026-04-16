# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal productivity app (todos, projects, meetings, daily goals) with audio recording and AI transcription. React/TypeScript frontend + Python FastAPI backend, SQLite database.

## Running the App

**Backend:**
```bash
cd backend
bash start.sh
# Or manually: activate venv, then uvicorn main:app --reload --port 8001
```
The venv path is configured in `project_config.yaml` under `backend.venv_path`.

**Frontend:**
```bash
cd frontend
npm install
bash start.sh   # or: npm run dev
# Serves at http://dev.localhost:5173, proxies /api to backend
```

**Production build:** `cd frontend && npm run build` (outputs to `dist/`)

There are no automated tests or linters configured.

## Architecture

- **Backend** (`backend/main.py`): Single-file FastAPI app (~1500 lines) containing all SQLAlchemy models, Pydantic schemas, and 43 REST endpoints. SQLite database (`management.db`).
- **Frontend** (`frontend/src/`): Vite + React 18 + TypeScript SPA using Tailwind CSS, React Router v7, and TanStack React Query for server state.
- **AI Integration**: OpenAI Whisper for audio transcription (with pydub chunking for files >25MB), GPT-4o-mini for todo suggestions from meeting notes. API key configured in `project_config.yaml`.

### Key Frontend Patterns

- React Contexts for global state: `ThemeContext`, `TimezoneContext`, `RecordingContext`, `HotkeysContext`, `TodoDefaultsContext`
- Pages in `src/pages/`, reusable components in `src/components/`
- All API calls go through `src/api.ts` (Axios), types in `src/types.ts`
- Vite proxies `/api` requests to the backend (configured in `vite.config.ts`)

### Key Backend Patterns

- File-based storage for meeting notes (`meeting_notes/`), audio (`meeting_audio/`), transcripts (`meeting_transcripts/`), and templates (`meeting_templates/`) — keyed by meeting note ID
- Soft deletes for meeting notes (`hidden` flag)
- Many-to-many association tables for meeting attendees, projects, and todos

## Feature ideation

Proposed features and usability improvements are tracked in `claude_readmes/features.md`. When the user brainstorms new ideas or directions, append them there as numbered sections following the existing format (title, description, bullet specifics, **Why:** line) and update the implementation order at the bottom. Treat this file as the living product backlog for this project.

## Configuration

| File | Purpose |
|------|---------|
| `project_config.yaml` | Backend port, venv path, OpenAI key, model selection |
| `frontend/_frontend_config.yaml` | UI behavior (fade timings, layout defaults) |
| `frontend/vite.config.ts` | Dev server proxy, HTTPS (optional via mkcert) |

## Database

SQLite with SQLAlchemy 2.0. Core tables: `persons`, `projects`, `todos`, `subtodos`, `todo_blockers`, `must_do_items`, `daily_goals`, `meeting_notes` (plus association tables). Todo statuses: `todo`, `done` (`in_progress` is deprecated; legacy rows are backfilled to `todo` on startup and new writes of that value are rejected). Importance levels: `low`, `medium`, `high`.
