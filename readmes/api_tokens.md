# API tokens

Let an agent or script use the app through the REST API with a scoped, revocable token instead of your login.

## Get a token

Until the settings UI exists (Phase 2), mint one with the script:

```bash
# production
fly ssh console -C "python3 scripts/api_token.py create claude-mac --scopes read,write:todos,write:persons,write:notes,write:daily --days 90"

# local dev (from backend/, venv active)
python scripts/api_token.py create claude-dev --scopes read
```

The token is printed once. Each token has a name, a scope list, and an expiry (default 90 days).

Scopes: `read`, `write:todos`, `write:persons`, `write:notes`, `write:daily`. Anything else (deletes, config, vaults, backup, transcription, token management) is never reachable with a token.

## Store it (Mac)

```bash
security add-generic-password -U -s management-api -a claude -w 'mgmt_pat_…'
```

Never paste it into a file, a repo, or a chat.

## Use it

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

```bash
fly ssh console -C "python3 scripts/api_token.py list"
fly ssh console -C "python3 scripts/api_token.py revoke claude-mac"
```

## Errors

- `401` — token missing, wrong, expired, or revoked.
- `403` with `required_scope` — mint a token with that scope.
- `403` "not available to API tokens" — do it in the UI.
- `429` — too many bad tokens from this IP; wait 15 minutes.
