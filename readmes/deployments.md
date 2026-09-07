# Two deployments, one repo

This repo is deployed twice, by two people, from the same `main`. Each
deployment is a separate Fly app with its own machine, its own volume, and its
own SQLite database. **No data is ever shared between them** — only code.

| | Config file | App | Region |
|---|---|---|---|
| Thomson | `fly.toml` | `management-wxisjq` | `sjc` |
| Mona | `fly.mona.toml` | `management-mona` | `ewr` |

The two files are identical except for `app`, `primary_region` and
`APP_ORIGIN`. Everything else — the Dockerfile, the volume mount, the VM size,
`min_machines_running`, the env block — is shared.

## Deploying

Always name your own config:

```bash
fly deploy                      # Thomson  → management-wxisjq
fly deploy -c fly.mona.toml     # Mona     → management-mona
```

Fly deploys **your working directory**, not a branch and not `main`. Whatever
is checked out is what ships, including uncommitted edits. Merging a feature
to `main` does not deploy it to anyone; each person deploys when they choose.

Run the regression gate first, every time (also in `CLAUDE.md`):

```bash
cd backend
python scripts/check_auth.py && python scripts/check_auth.py serve && \
python scripts/check_member_access.py && python scripts/check_member_access.py serve
```

## Getting a feature the other person built

1. Merge their branch into `main` (via PR).
2. `git pull`.
3. Deploy with **your** config, as above.

Schema changes in this project are additive and run on boot: new tables come
from `create_all()`, new columns from the `inspect()`-guarded `ALTER TABLE`
block in `backend/main.py`. There is no migration step and existing rows are
untouched. Everyone's database starts empty for a new feature — content does
not travel with the code.

## Do not do these

- **Do not put your app name in `fly.toml`.** It is the shared config. If your
  app name lands on `main`, the other person's next deploy targets your app.
  This is the whole reason for the second file.
- **Do not run a bare `fly deploy` if you are Mona** (or `-c fly.mona.toml` if
  you are Thomson). Being in different Fly orgs makes this fail rather than
  clobber, but do not rely on that.
- **Do not `fly scale count` above 1.** SQLite lives on a single volume; a
  second machine gets its own empty volume and a silently diverging database.
- **Do not commit `project_config.yaml`.** `backend.venv_path` is a per-machine
  path. Keep it out of commits with
  `git update-index --skip-worktree project_config.yaml`
  (undo with `--no-skip-worktree`). The real fix — reading the venv from an env
  var in `backend/start.sh` — has not been done.
- **Do not commit `backend/.env`.** It holds the OpenAI key. It is git-ignored
  now, but it was not always.
- **Do not expect the two instances to sync.** They never will. Pick one as
  your real app; the local checkout is a dev sandbox with throwaway data.
- **Do not assume your API tokens gain new scopes.** Scopes are fixed when a
  token is created. A token made before `write:social` existed cannot touch
  friends — issue a new one.
- **Do not roll back past the multi-user release without reading the rollback
  note in `CLAUDE.md`** (`UPDATE users SET is_active=0 WHERE role<>'owner'`
  first). Additive schema makes most other rollbacks safe: an older image just
  ignores tables it does not know about.

## Local setup on a new machine

```bash
# backend
uv venv <path>                                   # then set backend.venv_path
uv pip install -r backend/requirements.txt       #   in project_config.yaml
cd backend && python scripts/create_user.py <username>   # first user = owner

# frontend
cd frontend && npm install
```

`backend/.env` (git-ignored) holds the local-only settings:

```
OPENAI_API_KEY=          # optional; transcription + AI suggestions need it
COOKIE_SECURE=0          # local dev is plain HTTP, where a Secure-only
                         # session cookie is dropped and login silently fails
BACKUP_LOOP_ENABLED=0    # the backup manifest points at one person's Google
                         # Drive; leave the loop off unless it is yours
```

Then `bash start.sh` in `backend/` and `frontend/`.

Note the databases are separate here too: an account created locally does not
exist on the server. Both report `Invalid username or password` for a missing
account and a wrong password alike (deliberate — it hides whether an account
exists), so "my password stopped working" is usually "wrong database".

## Backups: currently none

`BACKUP_LOOP_ENABLED = "0"` in both configs. The backup code in
`backend/backup/` writes to a local Google Drive folder, which does not exist
in a container, so **no deployed instance backs itself up**. Fly takes daily
volume snapshots kept 5 days, which is a floor, not a plan.

Until it is rewritten for rclone/Tigris, pull a copy down by hand:

```bash
fly ssh console -c <your config> -C "sqlite3 /data/management.db .dump" \
  > ~/mgmt-backup-$(date +%F).sql
```
