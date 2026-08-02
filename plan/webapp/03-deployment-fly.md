# 03 — Deployment: Fly.io Container

One Fly machine runs uvicorn serving both the API (mounted under `/api`) and the built SPA; a 10 GB volume at `/data` holds the SQLite DB and all media. The Fly proxy terminates TLS. Roles that a reverse proxy would have played: TLS → Fly proxy; `/api` routing + SPA fallback → `backend/serve.py`; secure headers → Starlette middleware; upload cap → in-app only (the Fly proxy has no request-body limit — the Phase 2 cap is mandatory, and it's also the pydub memory-safety bound).

Railway/Render deltas where material are noted inline; the Dockerfile is portable to both.

## Prerequisite code change: `DATA_DIR`

Today the DB URL is CWD-relative (`sqlite:///./management.db`, `main.py:120`) and the media dirs are `__file__`-relative (`main.py:109-118`) — data lives *inside* the deploy artifact. Introduce:

```python
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent))
```

and derive `DATABASE_URL`, `MEETING_AUDIO_DIR`, `MEETING_TRANSCRIPTS_DIR`, `MEETING_TEMPLATES_DIR`, `MEETING_NOTES_DIR`, `NOTES_DIR`, and the `user_settings.json` path from it (~8 lines near `main.py:100-120`). Default preserves local behavior exactly; in the container `DATA_DIR=/data` puts everything on the volume so deploys never touch data.

Also enable WAL: `event.listens_for(engine, "connect")` → `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000` (safer concurrent reads during backups).

## Dockerfile (repo root) — multi-stage

Multi-stage (Node stage builds `dist/`) rather than build-locally-and-COPY: `fly deploy` uses Fly's remote builder, so deployment stays a single command needing no local Docker or Node, and it's impossible to ship a stale locally-built `dist/`. Layer caching absorbs most of the `npm ci` cost.

```dockerfile
# ---- Stage 1: frontend ----
FROM node:22-slim AS webbuild
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY project_config.yaml ./          # vite.config.ts reads ../project_config.yaml at build time
COPY frontend/ frontend/             # includes _frontend_config.yaml
RUN cd frontend && npm run build

# ---- Stage 2: runtime ----
FROM python:3.13-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg sqlite3 rclone \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY project_config.yaml ./
COPY backend/ backend/
COPY --from=webbuild /build/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 8080
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8080", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
```

**`.dockerignore` (repo root) is critical** — ~1 GB of data currently lives inside `backend/`, and `fly deploy` uploads the whole build context to the remote builder:

```
backend/management.db*
backend/meeting_audio/
backend/meeting_transcripts/
backend/meeting_notes/
backend/meeting_templates/
backend/notes/
backend/user_settings.json
backend/.env
frontend/node_modules/
frontend/dist/
.git/
__pycache__/
*.pem
```

(`meeting_templates/` ships empty in the image and gets seeded on the volume during migration; alternatively keep it in the image — decide at implementation.)

*Railway/Render:* same Dockerfile; both default to build-on-git-push instead of CLI-initiated builds.

## Serving the SPA: `backend/serve.py` (pure Python — no Caddy/nginx in the container)

An ASGI mount strips the `/api` prefix exactly like the Vite dev proxy, so the 62 prefix-free routes in `main.py` are untouched and **dev workflow is unchanged** (`start.sh` / `uvicorn main:app --reload` as today); `serve:app` is used only by the container CMD. An in-container proxy would need a process supervisor and a bigger image while buying nothing at one-user traffic.

```python
# backend/serve.py
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from main import app as api_app

DIST = (Path(__file__).parent.parent / "frontend" / "dist").resolve()

app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
app.mount("/api", api_app)                                   # prefix stripped, like the Vite proxy
app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    candidate = (DIST / full_path).resolve()
    if full_path and candidate.is_file() and candidate.is_relative_to(DIST):
        return FileResponse(candidate)                       # favicon, manifest, icons, sw.js
    return FileResponse(DIST / "index.html")                 # SPA fallback
```

Integration notes:

- The auth middleware lives on the inner `api_app` and runs for every `/api/*` request; inside the mount, Starlette keeps the full path in `scope["path"]` with the prefix in `root_path`, so the middleware strips `root_path` before matching `PUBLIC_PATHS`. Run the all-routes-401 test against `serve:app` too.
- The **secure-headers middleware goes on the outer app** (static responses need headers too): ~10-line middleware adding HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`.

## Volume

```
fly volumes create data --region <primary_region> --size 10
```

mounted at `/data` — the `DATA_DIR` refactor makes DB + audio + transcripts + notes + templates + `user_settings.json` land there with zero further code change. **10 GB**: ~1 GB audio today and growing; volumes extend live (`fly volumes extend`) but never shrink.

Constraints:

- A volume pins the app to **one machine in one region** — which matches the SQLite single-writer / single-uvicorn-worker design exactly. Never let `fly scale count` create a second machine (it would get an empty second volume and a divergent SQLite).
- Deploys to a single volume-backed machine are briefly down during restart (no blue-green with volumes). Seconds of downtime; acceptable. Use `fly deploy --strategy immediate` if the default ever balks.
- **Auto-stop: `auto_stop_machines = "suspend"`, `auto_start_machines = true`, `min_machines_running = 0`.** Suspend (RAM snapshot, works ≤2 GB RAM) resumes in ~1 s; the Fly proxy holds the waking request, so the iPhone just sees a slightly slow first request. Caveats: the in-app backup loop only runs while awake (fine — the machine is awake whenever there's new data, see Backups), and if wake latency ever annoys, flip to `min_machines_running = 1` (~$6/mo more).

*Railway/Render:* volumes/disks pin the same way; Render disks disable zero-downtime deploys and need a paid instance; neither has a suspend equivalent.

## fly.toml (repo root)

```toml
app = "management-<yourname>"
primary_region = "sjc"               # pick nearest

swap_size_mb = 2048                  # headroom for pydub decode spikes

[env]
  DATA_DIR = "/data"
  APP_ORIGIN = "https://app.example.com"   # or https://management-<yourname>.fly.dev
  COOKIE_SECURE = "1"
  BACKUP_LOOP_ENABLED = "1"          # the in-app loop IS the backup mechanism here
  VAULTS_ROOT = "/data/vaults"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0

[[mounts]]
  source = "data"
  destination = "/data"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

**Memory sizing:** 1 GB RAM + 2 GB swap. The driver is pydub: `AudioSegment.from_file` decodes the entire upload to raw PCM — a 60 MB compressed recording becomes several hundred MB, and a 2-hour meeting near the 300 MB cap could exceed 1 GB decoded. Swap absorbs spikes (slow but survives); if transcodes OOM in practice, set `memory = "2gb"` rather than tuning further.

**Custom domain:** `fly certs add app.example.com` + CNAME → automatic TLS. `APP_ORIGIN` (CORS + Origin CSRF check) must match whichever hostname is actually used.

## Secrets

`fly secrets set OPENAI_API_KEY=sk-...` — injected as env vars, so the Phase 0 `os.environ` change works unmodified (no `.env` in the container; `load_dotenv()` is a no-op there). Tigris credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) arrive the same way via `fly storage create`. Nothing secret ever enters `fly.toml` or `project_config.yaml`.

## Deploy workflow

- First time: `fly launch --no-deploy` (edit fly.toml per above) → `fly volumes create` → `fly storage create` → `fly secrets set` → `fly deploy`.
- Every time after: **`fly deploy`** — remote builder runs both stages, pushes, restarts the machine. That's the whole workflow.
- Rollback: `fly releases` + `fly deploy --image <previous>`.

## Data migration (one-time, ~1 GB)

Relay through Tigris with rclone — resumable, verifiable (`rclone check`), and it doubles as the dry-run of the backup path:

1. Quiesce the local backend; `sqlite3 backend/management.db ".backup <scratch>/management-migrate.db"` (proper snapshot, not `cp`).
2. `fly storage create` (Tigris bucket; credentials auto-set as app secrets) — needed for backups anyway.
3. Laptop → bucket: `rclone copy` the snapshot DB + `meeting_audio/` + `meeting_transcripts/` + `meeting_templates/` + `notes/` + `meeting_notes/` (legacy, keep for safety) + `user_settings.json` → `tigris:management-migrate/`. Verify with `rclone check`.
4. Bucket → volume: `fly ssh console` (rclone is in the image) → `rclone copy tigris:management-migrate/ /data/`; place the snapshot at `/data/management.db`; verify row counts via `sqlite3` and `du -sh /data/meeting_audio`; `fly machine restart`.
5. Fallback: `fly sftp shell` + `put` a single tarball, extract via ssh console — fewer moving parts, but a non-resumable 1 GB single-stream upload.

## Backups (no host cron exists)

Two layers:

- **Baseline — Fly volume snapshots:** automatic daily, default 5-day retention; extend with `fly volumes update <vol-id> --snapshot-retention 14`. Restore granularity is honest-but-coarse: create a *new volume* from a snapshot and attach it (whole-volume, not per-file). Snapshots happen regardless of suspend state.
- **Primary — repurpose the existing in-app hourly `backup_loop`** (`backend/backup/scheduler.py`, spawned in lifespan; keep `BACKUP_LOOP_ENABLED=1`): rewrite `backend/backup/backup.py` + `manifest.yaml` — delete the hardcoded macOS `repo_root` / Google Drive CloudStorage path — to:
  1. `sqlite3 /data/management.db ".backup /data/backups/management-<date>.db"` (WAL-safe), keeping the existing 10-day retention logic;
  2. `rclone sync /data tigris:management-backup/data --exclude "management.db*"` + `rclone copy /data/backups tigris:management-backup/db`, destinations from env.

  The loop only runs while the machine is awake — and it's awake whenever the app is used, so every day with new data gets backed up. Audio is append-mostly; hourly `sync` is cheap after the first pass. Auth-gated `POST /backup/run` triggers the same function on demand.
- Alternative kept for the record: rclone → Google Drive preserves today's destination, but headless Drive OAuth (token minted locally, injected via secret) is clunky versus Tigris's native S3 keys. Choose Drive only if seeing backups in Drive matters.

## Cost (verify against current Fly pricing at implementation time)

- Always-on: shared-cpu-1x / 1 GB ≈ $5.70/mo + 10 GB volume ≈ $1.50/mo + Tigris at ~2 GB ≈ pennies → **≈ $7–8/mo**.
- With suspend and personal usage (~6–10 h/day awake): compute roughly halves → **≈ $4–5/mo**. Volume + snapshots bill regardless of machine state.

## Phasing

- **Phase 3 — Containerize (~3–4 h, entirely local):** `Dockerfile`, `.dockerignore`, `backend/serve.py` (+ headers middleware). Test with zero Fly involvement:
  ```
  docker build -t management .
  docker run -p 8080:8080 -v "$PWD/localdata:/data" \
    -e DATA_DIR=/data -e OPENAI_API_KEY=... -e COOKIE_SECURE=0 management
  ```
  seeded with a copy of real data. This *is* the full prod topology — exercise login, SPA deep-link refresh, audio upload incl. `sendBeacon` flush, a transcription, `/api` 401s, and the upload cap. When it works, Fly is just hosting it.
- **Phase 4 — Fly provisioning + cutover (~2–4 h + ~1 GB upload):** launch/volume/storage/secrets/deploy; smoke-test on `*.fly.dev`; custom domain; data migration; backup rewrite. Verify one backup object lands in Tigris, `fly volumes snapshots list` shows a snapshot, and after 48 h the iPhone's rolling session survived suspend/resume cycles.

## Verification checklist

- [ ] `docker build` succeeds; image contains ffmpeg, sqlite3, rclone, `frontend/dist`.
- [ ] Local `docker run` with a volume-mounted data copy: login, deep-link refresh (`/todos/123` → SPA), audio upload + playback + transcription, 401 on `/api/*` without cookie, 413 past the upload cap.
- [ ] Deploy context is small (`fly deploy` output shows MBs, not a GB — `.dockerignore` working).
- [ ] `https://<app>.fly.dev` serves the SPA with HSTS/nosniff headers; `force_https` redirects.
- [ ] After migration: table row counts match local; `du -sh /data/meeting_audio` matches; audio plays; a transcription succeeds (OpenAI secret wired).
- [ ] Machine suspends when idle and wakes on request in ~1–2 s.
- [ ] Backup object appears in Tigris after an hour of use; `POST /backup/run` works; volume snapshot listed.
- [ ] iPhone session survives 48 h across suspend/resume.
