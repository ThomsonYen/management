# Update — shipping code changes

Day-to-day loop after the app is live on Fly.

## 1. Develop and test locally

Dev workflow is unchanged — no container involved:

```bash
cd backend  && bash start.sh     # uvicorn main:app --reload :8001
cd frontend && bash start.sh     # Vite on https://dev.localhost:5173, proxies /api
```

Log in with your local user. Data stays in `backend/` (local) — completely separate from the Fly volume.

## 2. Pre-deploy checks

```bash
# every route still requires auth (run after any backend route changes)
cd backend && python scripts/check_auth.py && python scripts/check_auth.py serve

# frontend compiles
cd frontend && npm run build
```

If you changed anything risky (upload handling, serve.py, Dockerfile), also do a local
container run — it is the exact production topology:

```bash
docker build -t management . && docker run --rm -p 8080:8080 \
  -v /tmp/localdata:/data -e DATA_DIR=/data -e COOKIE_SECURE=0 management
```

## 3. Deploy

**If the app was launched from GitHub (Option A in `_setup.md`):**

```bash
git add -A && git commit -m "..." && git push origin main
```

Every push to `main` auto-deploys — so only push when `main` is in a deployable state
(the pre-deploy checks above are your gate).

**If using the CLI (Option B):**

```bash
fly deploy
```

Either way, Fly's builder runs both Dockerfile stages (Node builds the frontend — no local
Docker or Node needed), pushes, and restarts the machine. Expect a few seconds of downtime
(single machine with a volume; no blue-green).

Your data is untouched by deploys — the DB and media live on the `/data` volume, outside
the image.

## 4. Verify

```bash
fly logs            # watch startup; "Application startup complete."
```

Open the site, log in if the session expired (it shouldn't — sessions survive deploys, they
live in the DB), click something that touches your change.

## 5. If it broke — roll back

```bash
fly releases                       # find the previous version's image ref
fly deploy --image <previous-image>
```

DB schema changes are additive-only (startup `create_all` + `ALTER TABLE` migrations in
`main.py`), so an older image runs fine against a newer DB.

## Notes

- **New backend dependency?** Pin it in `backend/requirements.txt` (including transitive
  deps — the file is fully pinned) and install locally with
  `uv pip install --python <venv>/bin/python -r backend/requirements.txt`.
- **New secret?** `fly secrets set NAME=value` (restarts the machine). Locally: add to
  `backend/.env`.
- **New non-secret config?** `[env]` block in `fly.toml`, then `fly deploy`.
- **Never** `fly scale count 2` — SQLite + one volume means exactly one machine.
