# Setup — from zero to running on Fly.io

One-time setup. Commands run from the repo root unless noted.

## 1. Local prerequisites (already done on this machine)

1. Create `backend/.env` (git-ignored) with the secrets:
   ```
   OPENAI_API_KEY="sk-..."
   ```
2. Install backend deps into the venv (path in `project_config.yaml`):
   ```bash
   uv pip install --python <venv>/bin/python -r backend/requirements.txt
   ```
3. Seed your login user (prompts for a password, min 8 chars):
   ```bash
   cd backend && python scripts/create_user.py <username>
   ```
4. Sanity check — every API route must require login:
   ```bash
   cd backend && python scripts/check_auth.py && python scripts/check_auth.py serve
   ```
5. Run the app locally as usual (`backend/start.sh` + `frontend/start.sh`) and log in.

## 2. Verify the production container locally (optional but recommended)

```bash
docker build -t management .
mkdir -p /tmp/localdata
docker run -d --name mana-test -p 8080:8080 \
  -v /tmp/localdata:/data -e DATA_DIR=/data -e COOKIE_SECURE=0 management
# seed a user inside the container:
docker exec -it mana-test python scripts/create_user.py <username>
```

Open http://localhost:8080 — log in, click around. Then `docker rm -f mana-test`.

## 3. Create the Fly app (one time)

A `fly.toml` is already committed at the repo root (volume mount, auto-suspend, env,
VM size — see `03-deployment-fly.md` for the reasoning). Pick ONE of the two options.

### Option A — dashboard "Launch from GitHub" (recommended if you want auto-deploy on push)

1. Push the repo to GitHub (it's safe: secrets and data are git-ignored; the repo is private):
   ```bash
   git add -A && git commit -m "Web deployment: auth, hardening, container"
   git push origin main
   ```
2. On [fly.io/dashboard](https://fly.io/dashboard) click **Launch an app** → **Launch from
   GitHub** → grant the Fly GitHub app access to `ThomsonYen/management` → select the repo.
3. In the launch settings screen:
   - Confirm the app name (must be globally unique) and region; if you change the name,
     update `app` and `APP_ORIGIN` in `fly.toml` afterwards and push.
   - The committed `fly.toml` + `Dockerfile` drive the rest (the `[[mounts]]` block makes
     Fly create the 10 GB `data` volume automatically).
   - Add the secret `OPENAI_API_KEY` in the **Secrets** section — never commit it.
4. Launch. From now on **every push to `main` auto-deploys**.

### Option B — CLI

```bash
brew install flyctl
fly auth signup                            # or: fly auth login
fly launch --no-deploy                     # detects the existing fly.toml + Dockerfile
fly secrets set OPENAI_API_KEY="sk-..."    # the rotated key
fly deploy                                 # creates the volume from [[mounts]] on first deploy
fly status                                 # one machine, running
```

Either way: never scale above 1 machine (`fly scale count 1`) — SQLite lives on the single volume.

## 5. Seed the user and smoke-test

```bash
fly ssh console -C "python scripts/create_user.py <username>"
```

Open `https://<app-name>.fly.dev` — log in, create a todo.

## 6. Migrate your existing data (one time)

```bash
# on the laptop — stop the local backend first
sqlite3 backend/management.db ".backup /tmp/management-migrate.db"

fly storage create                          # Tigris bucket; creds auto-set as app secrets
# copy data up (install rclone locally: brew install rclone; configure the tigris remote
# with the keys printed by `fly storage create`)
rclone copy /tmp/management-migrate.db tigris:<bucket>/migrate/
rclone copy backend/meeting_audio    tigris:<bucket>/migrate/meeting_audio/
rclone copy backend/meeting_transcripts tigris:<bucket>/migrate/meeting_transcripts/
rclone copy backend/meeting_templates   tigris:<bucket>/migrate/meeting_templates/
rclone copy backend/notes            tigris:<bucket>/migrate/notes/
rclone copy backend/user_settings.json  tigris:<bucket>/migrate/

# on the machine — pull it down into the volume
fly ssh console
  rclone copy :s3,env_auth=true:<bucket>/migrate/ /data/    # rclone in the image reads the AWS_* secrets
  mv /data/management-migrate.db /data/management.db
  sqlite3 /data/management.db "select count(*) from todos;" # compare against local
  exit
fly machine restart
```

Log in on the site and spot-check: a note with audio plays, a small transcription works.

## 7. iPhone

1. Open `https://<app-name>.fly.dev` in Safari, log in.
2. Share sheet → **Add to Home Screen** (full PWA polish lands with plan phases B–E).

## 8. Custom domain (optional)

```bash
fly certs add app.yourdomain.com     # then add the CNAME it prints at your DNS
```

Update `APP_ORIGIN` in `fly.toml` to the custom domain and `fly deploy`.
