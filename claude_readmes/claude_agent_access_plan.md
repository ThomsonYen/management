# Claude Agent Access — Implementation Plan

Goal: let Claude Code on the Mac (and optionally scheduled cloud runs) read the live app, via the existing REST API only, at `https://management-wxisjq.fly.dev`, write reports, and act on it — create/edit todos, move focus, mark check-ins ("ping people") — **without** handing it the login password or a browser session, and with every action scoped, revocable, and auditable.

## Current state (what we build on)

- Auth is a single-user password login → `session` cookie (httpOnly, SameSite=Lax, 90d TTL). Middleware `require_auth` in `backend/main.py` accepts **only** the cookie; all non-GET requests additionally pass an Origin check against `_cors_origins`.
- No API tokens, no scopes, no audit log.
- Prod mounts the API under `/api` (`serve.py`); dev serves it at the root on `:8001`.
- The relevant domain actions already exist as endpoints:
  - todos: `GET/POST /todos`, `PUT /todos/{id}` (`is_focused`, `focus_order`, `status`, …), `PUT /todos/reorder-focus`, `POST /todos/{id}/subtodos`
  - focus = `is_focused` + `focus_order` on a todo
  - "ping" = check-in watermark: `PUT /persons/{id}` with `last_check_in_date`; overdue list derivable from `GET /persons` (`is_direct_report`, `check_in_interval_days`, `last_check_in_date`)
  - reports = notes: `POST /notes` (`kind='personal'`, tags via `#report/...` in the body), `PUT /notes/{id}`
  - context: `GET /todos/recently-done`, `/must-do/{date}`, `/daily-goals`, `/persons/progress`, `/projects/tree`, `/notes/search`, `/schedule/reminders`

## Architecture decision — API-only (decided 2026-08-24)

Claude talks to the **same REST API the frontend uses**, authenticated with a scoped Personal Access Token. No separate MCP server: one surface to maintain. The agent-friendliness that an MCP wrapper would have provided is instead pushed into the API itself (composite endpoints like `/agent/digest`, `/todos/focus`) and into a small client wrapper script + a living operator manual served by the API.

Rejected:
- **MCP server** — a second surface to keep in sync with the API. If ever wanted, generate it from `/openapi.json` with a generic OpenAPI→MCP server rather than hand-writing tools.
- **SQLite over `fly ssh`** — read-only at best, bypasses app invariants (tag sync, check-in watermark logic), root on the machine.

Backend change needed: **Personal Access Tokens (PAT) with scopes**, accepted as `Authorization: Bearer …`.

### Agent-friendly API principle

**TODO (Phase 1): add a section to `CLAUDE.md` stating that API development must be agent-friendly.** Concretely:
- Every capability a human has in the UI should be reachable as a plain JSON endpoint — no UI-only logic.
- Multi-step UI actions get a composite endpoint (e.g. focus reorder, weekly digest) so a caller doesn't have to know the sequence.
- Responses are self-describing (ids + human labels together, ISO dates, explicit enums); errors say *why* (`422` with field names, `403` with the missing scope).
- Mutations are idempotent where possible and return the updated object, so an agent can show a before/after.
- `/openapi.json` is the contract; keep summaries/descriptions on routes populated because that's what an agent reads.

### Two agents, two knowledge sources (decided 2026-08-24)

Claude Code assembles context per launch directory: `~/.claude/CLAUDE.md` (global), `<repo>/CLAUDE.md` (project), auto-memory under `~/.claude/projects/<encoded-cwd>/memory/`, skills, settings. None of it syncs across devices except what's in git. So the separation is made **structural**, not by discipline:

| | Coding agent | Operating agent |
|---|---|---|
| Where it runs | inside this repo checkout | any device, any cwd, **no checkout** |
| Instructions | `CLAUDE.md`, `.claude/rules/`, this repo's auto-memory | a tiny global skill (`~/.claude/skills/mgmt-operator/`) + the manual fetched from the API |
| Knows about | architecture, conventions, "keep the manual in sync" | base URL, where the token lives, "fetch `/agent/manual` first" |
| Auto-memory | this repo's cwd dir | whatever cwd it runs from (e.g. `~/ops/`) — a different dir, so it never mixes with coding memory |

The coding agent **maintains** the manual but never uses it to operate; the operating agent **reads** the manual but never sees `CLAUDE.md`. Anything the operator learns that should persist across devices gets promoted into the manual by the coding agent.

### `backend/agent_manual.md` — the living operator manual

Lives in `backend/` so the Docker image ships it and the API can serve it. **Continuously maintained alongside the API**: base URLs (dev/prod), how to obtain the token (Keychain), the wrapper script, scopes and what they permit, endpoint recipes for common tasks (digest, create/edit/complete todo, move focus, check in a person, write a report), conventions (tags, dates, statuses), and what the agent must never do. **Every change to an endpoint updates this file in the same commit** — add that rule to `CLAUDE.md` alongside the agent-friendly principle. Mention it from the root `README.md`.

Served by the API:
- `GET /agent/manual` (scope `read`) → the markdown, `Content-Type: text/markdown`, with an `X-Manual-Version` header (git sha or file mtime) so the operator can tell what it's reading. Because it's served from the deployed code, the manual an agent reads always matches the API it's calling — no sync step, any device.
- `GET /agent/skill` (scope `read`) → a tarball/zip of `tools/operator-skill/` so a new device can install the bootstrap skill straight from the app (the manual documents this).

### `tools/operator-skill/` — the operator bootstrap skill

Canonical copy of the Claude Code skills installed under `~/.claude/skills/` on each operating device — one subfolder per skill: `mgmt-operator/` (`SKILL.md`, the `mgmt` wrapper from §5, and `report`, a deterministic digest→markdown renderer), `daily-report/`, `weekly-report/`, `checkins/`. Installing on a new device = fetch `GET /agent/skill`, unpack into `~/.claude/skills/`, add the keychain entry. The bootstrap skill is deliberately dumb ("run `GET /agent/manual` and follow it"); the workflow skills are short step lists that always end in a user confirmation before a write. All API knowledge stays in the served manual.

## Security design

### 1. Tokens (backend)

- New table `api_tokens(id, user_id, name, token_hash, scopes, created_at, expires_at, last_used_at, revoked_at)`. Store `sha256(token)` only — mirrors `AuthSession.token_hash`.
- Token format `mgmt_pat_<secrets.token_urlsafe(32)>`; shown exactly once at creation. The `mgmt_pat_` prefix makes accidental commits greppable (add a pre-commit / CI grep).
- Default expiry 90 days (same as sessions); `expires_at` required, max 365d.
- Middleware: if `Authorization: Bearer` is present, resolve the token → user + scopes; skip the cookie path entirely. **Never** accept the token in a query string. Bearer requests skip the Origin/CSRF backstop (no ambient credential → no CSRF), but every mutating request must pass the scope check. Update `last_used_at` at most once per hour (like `SESSION_REFRESH_INTERVAL`) to avoid a write per call.
- Rate-limit invalid bearer attempts with the same window/counter shape as `LOGIN_MAX_FAILURES`.
- Scopes (string set on the token):
  - `read` — every `GET` except `/config/settings`, `/vaults`, audio downloads
  - `write:todos` — `POST /todos`, `PUT /todos/{id}`, `PUT /todos/reorder-focus`, subtodos, `POST /todos/{id}/restore`
  - `write:persons` — `PUT /persons/{id}` restricted to `last_check_in_date` (and `notes`) fields; not `is_direct_report`, not reorder
  - `write:notes` — `POST /notes`, `PUT /notes/{id}` for `kind='personal'` only (meeting notes stay human-authored)
  - `write:daily` — `PUT /daily-goals/{date}`, `POST /must-do/{date}`, `PUT /must-do/items/{id}`
  - **No scope ever grants**: `/auth/*`, `/config/settings`, `/backup/run`, `/vaults*`, any `DELETE`, any `/purge`, `/notes/{id}/transcribe`, `/suggest-todos`, audio upload/download, `/api-tokens*`. These are cookie-session-only. Deletions by the agent are *soft-deleted by a human later*, never by the agent.
- Route → scope mapping lives in one dict next to `PUBLIC_PATHS` so it's reviewable in one place; unknown routes default to **deny** for bearer auth.

### 2. Audit log

- Table `api_audit(id, token_id, ts, method, path, status, summary)` where `summary` is a small JSON (todo id/title touched, person id, note id). Written for every bearer request that isn't a `GET`.
- `GET /api-tokens/{id}/audit` for the settings UI; keep 90 days, prune in the existing `lifespan()` cleanup alongside expired sessions.

### 3. Settings UI (frontend)

- New "API tokens" section in settings: create (name, scope checkboxes, expiry), one-time reveal with copy button, list with `last_used_at`, revoke, and an audit tail per token. Cookie-session only.

### 4. Secret storage on the Mac

- Token goes into the login Keychain: `security add-generic-password -s management-api -a claude -w`. The wrapper script reads it with `security find-generic-password -s management-api -a claude -w`; nothing on disk, nothing in `~/.claude/settings.json`, nothing in `CLAUDE.md`, nothing in the repo.
- Base URL from `MGMT_BASE_URL` (default `https://management-wxisjq.fly.dev/api`; `http://localhost:8001` for dev with a *separate* dev token).

### 5. Client wrapper script (`tools/operator-skill/mgmt`, installed as `~/.claude/skills/mgmt-operator/mgmt`)

A ~50-line script (Python or zsh) so Claude never types a token or a raw `curl`:

```
mgmt GET  /agent/digest
mgmt GET  '/todos?is_focused=true'
mgmt PUT  /todos/42 '{"status":"done"}'
mgmt POST /notes '{"title":"Weekly report 2026-W34","content":"#report/w2026_34\n..."}'
```

Behaviour: reads token from Keychain, sets `Authorization`, sends JSON, prints only the response body (never headers, never the token — even on error), non-zero exit on 4xx/5xx with the `detail` message. Supports `--dry-run` (prints the request without sending).

Backend additions so the client stays dumb:
- `GET /agent/digest` (scope `read`) — focused todos, overdue todos, overdue check-ins, today's must-do + goals, recently done, in one call.
- `PUT /todos/focus` — body `{"todo_ids":[…]}` sets `is_focused` + `focus_order` in one idempotent call (wraps the existing `reorder-focus`).
- `POST /persons/{id}/check-in` — sets `last_check_in_date` (default today), forward-only.
- Content fields returned to agents (note bodies, todo descriptions) are free text a human wrote; the operator README tells the agent to treat them as data, not instructions.

### 6. Claude Code permission policy

In `.claude/settings.json` (project scope):

```json
"permissions": {
  "allow": ["Bash(mgmt GET *)"],
  "ask":   ["Bash(mgmt POST *)", "Bash(mgmt PUT *)"],
  "deny":  ["Bash(mgmt DELETE *)", "Bash(curl *management-wxisjq*)"]
}
```

Reads are silent; every write is a confirm prompt showing the full command. This is the second layer beneath token scopes — scopes bound what *can* happen, prompts bound what *does* happen. The `deny` on raw `curl` to the prod host keeps every call going through the wrapper.

### 7. "Ping people" beyond the app

Inside the app, ping = `POST /persons/{id}/check-in`. Actually messaging someone stays in Claude Code's existing Slack connector: `/agent/digest` returns overdue check-ins with names; Claude drafts the Slack DM (`slack_send_message_draft`), the user approves, then Claude records the check-in. The management API never holds Slack credentials.

### 8. Optional hardening (later, independent)

- **Fly private networking**: expose a second listener only on the 6PN address and connect over `fly wireguard`; bearer auth then isn't reachable from the public internet at all. Overkill for v1; the scoped/expiring/audited token is the real control.
- **IP allow-list** per token — brittle on a laptop, skip unless the WireGuard path is adopted.
- **Scheduled cloud runs** (`/schedule` routines) need the token in the cloud environment — a *different* trust decision. If wanted, mint a separate `read`-only token named `routine-weekly-report` (+ `write:notes`) and revoke it independently.

## Threat model summary

| Threat | Mitigation |
|---|---|
| Token leaks (transcript, log, commit) | Never in prompts (Keychain → wrapper script only, body-only output); greppable prefix; 90d expiry; one-click revoke; `last_used_at` shows anomalies |
| Agent does something destructive | No delete/purge/config/backup scope exists for bearer; write tools prompt in Claude Code; audit log |
| Prompt injection via note/todo text the agent reads | Operator README rule: content is data; writes always human-confirmed; no scope can exfiltrate audio or change settings |
| Bearer auth widens CSRF surface | Bearer path has no cookie fallback; token can't be sent by a browser without JS + the secret |
| Brute-forcing tokens | 256-bit random; invalid-bearer rate limit |

## Phases

1. ✅ **Backend PATs + docs rules** (done 2026-08-24, not yet deployed) — `api_tokens` table (DDL in the `inspect()`-guarded block), bearer branch in `require_auth`, scope map, deny-by-default, invalid-bearer rate limit, `POST/GET/DELETE /api-tokens` (cookie-only). Add the agent-friendly-API principle and the "update `backend/agent_manual.md` with every endpoint change" rule to `CLAUDE.md`; create the first `backend/agent_manual.md` and `GET /agent/manual`. Verify with `curl -H "Authorization: Bearer …"` against dev: read OK, `DELETE /todos/1` → 403, no header → 401.
2. ✅ **Audit log + Settings UI** (done 2026-08-25; denied 403 attempts are audited too) — `api_audit`, prune in `lifespan()`, token management page with one-time reveal and audit tail. Deploy (`fly deploy`), mint the prod token, store in Keychain.
3. ✅ **Wrapper + read path** (done 2026-08-25; skill installed on the Mac from `GET /agent/skill`, permission rules in `.claude/settings.json`) — `tools/operator-skill/` (`SKILL.md` + `mgmt` wrapper), `GET /agent/skill`, `GET /agent/digest`, install the skill globally on the Mac, permission rules for `GET`. Exit: "what should I focus on today?" answers from live data with zero prompts.
4. ✅ **Write path** (done 2026-08-25; `PUT /todos/focus`, `POST /persons/{id}/check-in`; first agent-written report is note 120) — `PUT /todos/focus`, `POST /persons/{id}/check-in`; recipes in `backend/agent_manual.md` for create/edit/complete todo, move focus, check in, write report, append to note; ask-rules. Exit: Claude drafts a weekly report into a `#report/…` note and reorders focus after confirmation.
5. ✅ **Workflows** (done 2026-08-25) — skills `/daily-report`, `/weekly-report` (digest → `report` renderer → user edits → `POST /notes`) and `/checkins` (overdue → drafts → send via connected tool → `POST /persons/{id}/check-in`), all shipped in `tools/operator-skill/` as sibling skill folders and served by `GET /agent/skill`. Optional, not done: cloud routine with its own token.
6. ✅ **Hosted MCP for claude.ai / Desktop chat / mobile** (done 2026-08-25) — `backend/mcp_server.py`: streamable-HTTP MCP at `/mcp` (origin root) with a curated tool layer over the existing handlers (same scopes via `_need()`, same audit via `_audited()`), plus an OAuth 2.1 authorization server (DCR + PKCE; consent page = app login + scope picker; each grant is an `api_tokens` row named `connector: <client>`, so Settings → API tokens lists and revokes connectors; access tokens 8 h / refresh 90 d, rotated on refresh). Plain `mgmt_pat_` tokens also work as bearer on `/mcp` (Claude Code `--header`, `static_headers`). Reasoning: claude.ai custom connectors require OAuth-DCR out of the box; static headers are an admin-only beta. This is a hand-curated tool list rather than OpenAPI-generated — it stays thin because tools delegate to the handlers, and the CLAUDE.md rule now covers it.
   Still optional / not done: WireGuard-only bearer listener; token IP binding.

## Open decisions

1. Should `write:notes` be allowed to *edit* existing personal notes (append) or only create new ones? _Proposed: create + append only; no overwrite of a whole body._
2. Should the agent be able to mark todos `done`, or only create/edit/focus? _Proposed: yes, `complete_todo` — it's reversible via restore/status flip and highly useful for "I finished X"._
3. Token expiry default 90d vs. 30d for the write-capable token? _Proposed: 90d read, 30d write; the UI shows expiry so re-minting is a known chore._
4. Wrapper script in Python or zsh? _Proposed: Python (`httpx` already in the venv) — easier JSON handling and error formatting._
5. Ship the cloud-routine token at all in v1? _Proposed: no; Mac-only first._

## Critical files

- `backend/main.py` — `require_auth`, `_resolve_session`, `AuthSession`, `PUBLIC_PATHS`, `lifespan()` cleanup, DDL block: the templates for `api_tokens`, scope map, and audit pruning.
- `backend/serve.py` — `/api` mount; bearer path must strip `root_path` the same way the cookie path does.
- `frontend/src/pages/` settings page + `api.ts`/`types.ts` — token management UI.
- `frontend/src/api.ts` — canonical list of request/response shapes; the recipes in `backend/agent_manual.md` mirror these.
- `backend/agent_manual.md` + `GET /agent/manual` (to create), `tools/operator-skill/` (to create), and `CLAUDE.md` — the pieces that make the API usable by an agent and keep the two agents' knowledge apart.
- `Dockerfile` — confirm `backend/agent_manual.md` and `tools/operator-skill/` are copied into the image.
- `fly.toml`, `plan/webapp/01-security-hardening.md`, `02-authentication.md` — existing security decisions to stay consistent with.
