# Backup

Snapshot-based backup of the management app's user data and source code to Google Drive.

## Goals

- **Durable** — survive disk loss, accidental deletions, and bad migrations.
- **Point-in-time recovery** — keep the last 10 daily snapshots plus one per month, indefinitely.
- **Hands-off** — runs nightly via `launchd`, no human action needed.
- **Modular** — adding or removing what gets backed up is a one-line YAML edit, no script changes.
- **Zero extra local storage** — uses Google Drive Desktop in **Stream** mode; snapshots live in the cloud and only cache locally on access.

## Layout on Drive

```
~/Library/CloudStorage/GoogleDrive-<acct>/My Drive/management-backup/
├── daily/
│   ├── 2026-04-15/
│   │   ├── data/
│   │   │   ├── management.db          (sqlite3 .backup snapshot)
│   │   │   ├── meeting_notes/
│   │   │   ├── meeting_transcripts/
│   │   │   ├── meeting_templates/
│   │   │   └── meeting_audio/
│   │   └── code/
│   │       ├── backend/               (source only — no venv/cache/db/user data)
│   │       └── frontend/              (source only — no node_modules/dist)
│   ├── 2026-04-14/
│   └── ...                            (last 10 days)
└── monthly/
    ├── 2026-04/                       (first snapshot of the month; kept forever)
    ├── 2026-03/
    └── ...
```

## What gets backed up

Defined declaratively in [manifest.yaml](../backend/backup/manifest.yaml).

**Data (irreplaceable user content):**

| Target | Source | Method |
|---|---|---|
| `database` | `backend/management.db` | `sqlite_backup` — uses `sqlite3 .backup` for a crash-consistent copy, safe to run while the backend is writing |
| `meeting_notes` | `backend/meeting_notes/` | `copy` |
| `meeting_transcripts` | `backend/meeting_transcripts/` | `copy` |
| `meeting_templates` | `backend/meeting_templates/` | `copy` |
| `meeting_audio` | `backend/meeting_audio/` | `copy` |

**Code (reference snapshot in case git is unreachable):**

| Target | Source | Excludes |
|---|---|---|
| `backend_code` | `backend/` | `__pycache__`, `venv`, `.venv`, `*.db`, `meeting_*` |
| `frontend_code` | `frontend/` | `node_modules`, `dist`, `.vite` |

**Explicitly not backed up:** `project_config.yaml` (contains the OpenAI API key — back up out-of-band if at all).

### Adding a new target

Append a block to `manifest.yaml`:

```yaml
- name: my_new_thing
  source: some/path
  dest: data/my_new_thing
  method: copy           # or sqlite_backup
  exclude: [tmp, "*.log"]
```

No code changes. The orchestrator dispatches on `method`; to support a new method (e.g. `pg_dump`), add a handler to `HANDLERS` in [backup.py](../backend/backup/backup.py).

## Schedule

The scheduler runs **in-process inside the FastAPI backend** — there is no cron or launchd job. On app startup, [backup/scheduler.py](../backend/backup/scheduler.py) spawns an async loop via the FastAPI `lifespan` context manager.

**Firing rule.** Every hour, the loop evaluates:

> "Is the current user-local time past **02:00**, and does no snapshot exist yet for today's user-local date?"

If yes, it calls `run_backup_once` in a worker thread (via `asyncio.to_thread`, so the event loop stays responsive). If no, it sleeps another hour.

This predicate is self-healing:

| Situation | Outcome |
|---|---|
| Backend running at 02:00 | Fires at 02:00 |
| Backend started at 09:00, no snapshot yet today | Fires immediately on first tick |
| Backend restarted repeatedly through the day | Fires exactly once (predicate flips false after first run) |
| DST transition | At most a 1-hour drift, never a skipped day |
| **Backend not running at all for a day** | **That day is missed** — accepted tradeoff |

The fire-hour comparison uses the user's configured timezone, not server local time. See *Timezone source of truth* below.

**Logs.** The scheduler logs via Python's `logging` under the `backup.scheduler` logger, which goes to uvicorn's stdout/stderr (visible wherever you started the backend).

## Timezone source of truth

Both the scheduler and the frontend UI read timezone from the **backend**:

- Stored in `backend/user_settings.json` (git-ignored, created on first write)
- `GET /config/timezone` — returns current value, or falls back to system local
- `PUT /config/timezone` — validated against `zoneinfo.ZoneInfo`, persisted

On load, [frontend/src/TimezoneContext.tsx](../frontend/src/TimezoneContext.tsx) fetches the server value and adopts it (keeping localStorage as a warm cache for instant UI). When the user changes timezone in Settings, the new value is PUT to the backend. The scheduler's `get_timezone` callback re-reads the JSON file on every tick, so timezone changes take effect within an hour without a backend restart.

## Manual trigger

```
POST /backup/run
```

Runs `run_backup_once` in a worker thread using the current user-local date. Useful for a "Backup now" button or for testing without waiting for the hourly tick. Re-running on the same day is safe — it overwrites that day's snapshot.

## Retention

Pruning runs at the end of every backup:

- **daily/** — anything older than 10 days is deleted.
- **monthly/** — never auto-deleted. Add a retention rule later if desired; it's intentionally decoupled from daily logic.

The "first snapshot of the month wins" rule: on each run, if `monthly/YYYY-MM/` doesn't exist yet, the just-taken daily snapshot is copied there. This means the monthly snapshot represents the state near the start of the month, and backfills correctly if you miss day 1.

## Safety / crash-consistency

- **Atomic snapshots.** Each snapshot is written to `daily/<date>.tmp/` and only renamed to `daily/<date>/` once every target has completed. An interrupted run never leaves a partial snapshot visible to pruning or to the monthly promoter.
- **SQLite.** The database is copied via `sqlite3 .backup`, which uses the SQLite backup API and is safe to run concurrently with an active backend process. A plain file copy would risk corruption if the backend wrote mid-copy.
- **Drive not mounted.** The script fails loudly if the Drive root is missing rather than silently backing up to a local folder.

## Storage footprint

Streaming mode means **local disk usage is ~0** beyond a small cache. On Drive itself, each daily snapshot is a full copy (Drive does not deduplicate across folders), so roughly:

- ~225 MB per snapshot today (dominated by `meeting_audio`)
- 10 dailies + 12 monthlies ≈ **~5 GB** at current sizes

As audio accumulates this grows linearly. If it becomes painful, options are (a) drop `meeting_audio` from daily snapshots and keep it only in monthly, or (b) add a `tar_gz` method to compress large directories.

## Manual CLI usage

The backup script also has a CLI entry point, useful when the backend is not running:

```bash
/Users/michi/.uv/uv_venvs/mana_back/bin/python \
  /Users/michi/Documents/tyen/Work/Personal/management/backend/backup/backup.py
```

Re-running on the same day is safe — it overwrites that day's snapshot.

## Restore

A snapshot is just files on disk — restore by copying back:

```bash
SNAP="$HOME/Library/CloudStorage/GoogleDrive-<acct>/My Drive/management-backup/daily/2026-04-15"
cp "$SNAP/data/management.db" backend/management.db
rsync -a "$SNAP/data/meeting_notes/" backend/meeting_notes/
# ...etc
```

Stop the backend before restoring the database.
