# 01 — Security Hardening

Ordered checklist. Items 1–3 happen **before anything is exposed to any network**, even Tailscale. Items marked *(Phase 0)* are the stop-the-bleeding pass; the rest land in Phase 2 alongside the `DATA_DIR` refactor.

## 1. Rotate and relocate the OpenAI key *(Phase 0 — do first)*

The key in `project_config.yaml` (`keys.openai_key`) is live.

1. Rotate it at platform.openai.com **first**, regardless of anything else.
2. Load the new key from the environment: `python-dotenv` is already pinned in `backend/requirements.txt` (currently unused) — `load_dotenv()` at the top of `backend/main.py`, read `os.environ["OPENAI_API_KEY"]` (replaces the yaml read at `main.py:47-48`). Local dev keeps a git-ignored `backend/.env`; on Fly the same variable arrives via `fly secrets` and `load_dotenv()` is a harmless no-op.
3. Delete the `keys:` block from `project_config.yaml`; the file becomes secret-free and normally committable. Retire `add_except_configs.sh` (the manual `git add` exclusion workaround).
4. Check history: `git log -p --all -- project_config.yaml | grep sk-`. HEAD's committed version has the key blank, so likely clean — but if the key ever landed in a commit and the repo might ever be pushed anywhere shared, scrub with `git-filter-repo`. If the repo stays private, rotation alone is sufficient.

## 2. Fix CORS *(Phase 0)*

`main.py:1468-1474` has `allow_origins=["*"]` with `allow_credentials=True` — invalid per spec and dangerous with cookie auth. Replace with an env-driven explicit list: the prod origin (`APP_ORIGIN`) plus the dev origins (`https://dev.localhost:5173`, `http://localhost:5173`). In practice both dev (Vite proxy) and prod (`serve.py` same-origin) barely exercise CORS — which is exactly right.

## 3. Kill traceback leakage *(Phase 0)*

`main.py:2647` returns `traceback.format_exc()` in the 500 detail of the transcribe route. Log server-side, return `HTTPException(500, "Transcription failed")`. Also add a global `@app.exception_handler(Exception)` that logs and returns a generic 500 so future bugs don't leak either.

## 4. Fence the undefined `_transcribe_chunked` *(Phase 0, then fix properly)*

`main.py:2636` calls `_transcribe_chunked`, which **does not exist anywhere** — any audio file >25 MB raises `NameError`, caught and returned as a 500. Two steps:

1. Immediately: replace the call with `raise HTTPException(413, "Audio too large to transcribe in one pass")`.
2. Later (optional +2–3 h): implement it — pydub split into ~20 MB / ~20-minute chunks, sequential Whisper calls, join transcripts with `\n\n`. The ~1 GB audio dir says large files are normal, so this is worth doing.

## 5. Upload size cap + extension whitelist (Phase 2)

`POST /notes/{note_id}/audio` (`main.py:2531`) has no size limit and takes the file extension from the client-supplied filename.

- Stream to the temp file counting bytes; abort 413 past `MAX_AUDIO_UPLOAD_MB` (suggest **300**).
- Whitelist extensions `{webm, mp4, m4a, mp3, wav, ogg}`, else default `.webm` (the extension only feeds ffmpeg's demuxer hint; pydub transcodes to mp3 regardless).
- **On Fly this in-app cap is the only line of defense** — the Fly proxy imposes no request-body limit (unlike the Caddy `request_body` directive a VPS setup would have had). It is also the memory-safety bound: pydub decodes the whole file to PCM in RAM (see [03-deployment-fly.md](03-deployment-fly.md) memory sizing).

## 6. Restrict `POST /vaults` (Phase 2)

`main.py:2149` indexes **any** absolute filesystem path, and `GET /notes/{id}` then returns file bodies — even with auth, that's authenticated arbitrary file read. Constrain: `resolved = Path(data.path).expanduser().resolve()`; require `resolved.is_relative_to(VAULTS_ROOT)` where `VAULTS_ROOT` comes from env (prod: `/data/vaults`; local default: current behavior's notes dir). Resolving first also rejects symlink escapes.

## 7. Sanitize the note template param (Phase 2)

`main.py:2357` joins `data.template` into `MEETING_TEMPLATES_DIR / f"{data.template}.md"` unchecked → `../../` reads any `.md` on disk. Validate with `re.fullmatch(r"[A-Za-z0-9 _\-]+", data.template)` **and** check the resolved path `is_relative_to(MEETING_TEMPLATES_DIR)` — the same pattern the audio download routes already use (`main.py:2573-2576`).

## 8. Backup loop and `/backup/run` (Phase 2 / 4)

- `POST /backup/run` (`main.py:2785`) is covered by the auth middleware + Origin check once [02-authentication.md](02-authentication.md) lands; keep it.
- The hourly in-app backup loop currently writes to a hardcoded macOS Google Drive mount (`backend/backup/manifest.yaml`) — dead in a Linux container. Gate it behind `BACKUP_LOOP_ENABLED` env, and **on Fly keep it enabled** with a rewritten destination (sqlite `.backup` + rclone → Tigris; see [03-deployment-fly.md](03-deployment-fly.md) §Backups). Local dev can keep the Drive path or disable the loop.

## 9. Secure headers (Phase 3)

Formerly a Caddy `header` block in the VPS design; now a ~10-line Starlette middleware on the **outer** app in `backend/serve.py` (so static responses get headers too):

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `X-Frame-Options: DENY`

CSP is optional for a personal app; if added later, start at `default-src 'self'` and iterate against the Vite bundle.

## 10. API docs in prod (Phase 3)

`/docs` / `/openapi.json` sit behind the auth middleware anyway; additionally, the outer `serve.py` app is created with `openapi_url=None, docs_url=None, redoc_url=None`, and the SPA catch-all means the inner docs are only reachable under `/api/docs` when authenticated. Optionally disable entirely with an `ENV=prod` check.

## 11. Settings blob hygiene (ongoing)

`GET/PUT /config/settings` (auth-covered) serve `user_settings.json` — today it's UI prefs only (timezone, theme, hotkeys). Keep it that way; nothing secret ever goes in it.

## Verification checklist

- [ ] New OpenAI key works (`/notes/{id}/transcribe` on a small file); old key revoked.
- [ ] `git grep sk-` and `git log -p --all -- project_config.yaml | grep sk-` are clean.
- [ ] `project_config.yaml` committed with no `keys:` block; `add_except_configs.sh` deleted.
- [ ] A forced exception returns a generic 500 with nothing in the body; details appear in server logs.
- [ ] >25 MB audio transcription returns a clean 413 (or succeeds, if chunking implemented).
- [ ] Upload of a >300 MB file aborts with 413 without filling the disk.
- [ ] `POST /vaults` with `/etc` (or any path outside `VAULTS_ROOT`) → 400.
- [ ] Note creation with `template: "../secret"` → 400.
- [ ] Response headers on both `/` and `/api/...` include HSTS + nosniff (Phase 3).
