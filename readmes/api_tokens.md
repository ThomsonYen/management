# API tokens

Let an agent or script use the app through the REST API with a scoped, revocable token instead of your login.

## Get a token

**Settings → API tokens → New token.** Pick a name, scopes, and expiry (default 90 days). The token is shown once — copy it immediately. The same section lists tokens, shows when each was last used, revokes them, and has an **Audit** toggle showing every write (and every denied attempt) made with that token.

Without the UI (e.g. over SSH):

```bash
# production
fly ssh console -C "python3 scripts/api_token.py create claude-mac --scopes read,write:todos,write:persons,write:notes,write:daily --days 90"

# local dev (from backend/, venv active)
python scripts/api_token.py create claude-dev --scopes read
```

Scopes: `read`, `write:todos`, `write:persons`, `write:notes`, `write:daily`. Anything else (deletes, config, vaults, backup, transcription, token management) is never reachable with a token.

## Store it (Mac)

```bash
security add-generic-password -U -s management-api -a claude -w 'mgmt_pat_…'
```

Never paste it into a file, a repo, or a chat.

## Use it from Claude Code (recommended)

Install the operator skill once per device — it adds the `mgmt` wrapper that reads the token from the keychain and tells Claude to fetch the manual first:

```bash
T=$(security find-generic-password -s management-api -a claude -w)
curl -sS -H "Authorization: Bearer $T" https://management-wxisjq.fly.dev/api/agent/skill | tar xz -C ~/.claude/skills/
chmod +x ~/.claude/skills/mgmt-operator/mgmt ~/.claude/skills/mgmt-operator/report
~/.claude/skills/mgmt-operator/mgmt GET /agent/digest     # sanity check
```

That installs four skills: `mgmt-operator` (general), `/daily-report`, `/weekly-report`, `/checkins`. Then just ask Claude Code ("what should I focus on today?", "mark todo 42 done", `/daily-report`, `/checkins`). Reads run without prompts; every write asks for confirmation (rules in `.claude/settings.json`). Re-run the install to pick up skill updates after a deploy.

## Use it from Claude.ai, the desktop app chat, or your phone

The app is also an MCP server at `https://management-wxisjq.fly.dev/mcp`.

1. Claude → Settings → Connectors → **Add custom connector** → paste the URL.
2. Claude opens the app's sign-in page: enter your app username/password, tick the scopes, Connect.
3. Done — ask "what should I focus on today?" from any device. The grant shows up in Settings → API tokens as `connector: Claude` with the usual audit trail; revoke it there to disconnect.

Claude Code can use the same endpoint instead of the skill: `claude mcp add --transport http management https://management-wxisjq.fly.dev/mcp`.

## Use it by hand

```bash
T=$(security find-generic-password -s management-api -a claude -w)
B=https://management-wxisjq.fly.dev/api

curl -H "Authorization: Bearer $T" $B/auth/me            # check it works
curl -H "Authorization: Bearer $T" $B/agent/manual       # how to operate the app
curl -H "Authorization: Bearer $T" "$B/todos?is_focused=true"
```

Local dev: `B=http://localhost:8001` with a separate token.

`GET /agent/manual` is the full operator guide (recipes for todos, focus, check-ins, reports). An agent should read it fresh every session.

## Revoke

Settings → API tokens → the ban icon next to the token. Or:

```bash
fly ssh console -C "python3 scripts/api_token.py list"
fly ssh console -C "python3 scripts/api_token.py revoke claude-mac"
```

## Errors

- `401` — token missing, wrong, expired, or revoked.
- `403` with `required_scope` — mint a token with that scope.
- `403` "not available to API tokens" — do it in the UI.
- `429` — too many bad tokens from this IP; wait 15 minutes.
