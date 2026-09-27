# Design principles

Read this before designing a feature, a table, or an endpoint. These are the
rules the app is already built on. Details live in the files linked from each
section; this page is the "why" and the checklist.

## 1. Deprecate, don't delete

Retiring something must never cost the user data. Records move down a ladder,
one reversible step at a time:

| Stage | Meaning | Where it shows | How back |
|---|---|---|---|
| **Active** | In use | Everywhere | — |
| **Deprecated** | Retired, kept | Readable in its own "Deprecated" section and by direct link; **left out of pickers, boards and other places that start new work** | Reactivate |
| **Deleted** (soft) | Unwanted | Recently Deleted only | Restore |
| **Purged** | Gone | Nowhere | None — only from Recently Deleted, by explicit user action |

Rules:

- **Offer deprecation before deletion** for anything that other records point
  at or that has history worth keeping. Projects do this today
  (`projects.deprecated_at`, `POST /projects/{id}/deprecate` and `/undeprecate`).
  Persons and friends are the next candidates.
- **Deprecation changes visibility, not data.** Children, links and history are
  untouched. For example, todos stay in a deprecated project with their
  `project_id` as is.
- **Store it as a nullable timestamp** (`deprecated_at`, like `deleted_at`),
  never a boolean. You get "since when" for free, and `NULL` means active.
- **Keep the hierarchy consistent.** Deprecation cascades down to children.
  Reactivation also reactivates ancestors, and anything placed under a
  deprecated parent inherits deprecation. That way an active record never
  sits under a deprecated one, and the UI can treat a deprecated node's whole
  subtree as deprecated.
- **Lists include deprecated rows by default, marked with the field**, so every
  id still resolves to a name. `?include_deprecated=false` gives only the active
  ones. Pickers filter them out on the client, but keep the current value so it
  still displays (`frontend/src/utils/projects.ts`). Filters over existing
  work keep them, since you may want to look back at old work.
- **Deprecate and reactivate are idempotent** and return the updated object.
  Deprecating twice keeps the first timestamp.
- **Agents never deprecate, delete or purge on their own.** The owner does, in
  the app. The operator manual says "Soft deletes: never delete. If something
  should go away, tell the user."

## 2. Every UI capability is an API capability

An agent drives the app only through REST and MCP. No logic lives only in the
UI, multi-step actions get one composite endpoint, responses describe
themselves, and errors say why. A changed endpoint updates
`backend/agent_manual.md`, `_BEARER_ROUTE_SCOPES` and the matching MCP tool
in the same commit. See "Agent-facing API" in `CLAUDE.md`.

## 3. Deny by default

Bearer tokens reach only the routes in `_BEARER_ROUTE_SCOPES`, and members only
those in `_MEMBER_ROUTES`. A new route is owner-only and cookie-only until
someone deliberately lists it. For members, not-visible and non-existent are
both 404. See "Multi-user accounts" in `CLAUDE.md`. Run the regression gate
before every deploy.

## 4. Additive schema, applied on boot

There are no migrations. New tables come from `create_all()`, and new columns
from the `inspect()`-guarded `ALTER TABLE` block in `backend/main.py`. New
columns are nullable or have a default, and are never renamed or dropped. An
older image must still run against a newer database, and that is what makes
rollbacks safe.

## 5. The server computes derived state

Derived values like a friend's `status` and the digest are
computed once on the server and returned, never recomputed by each client.
That keeps the UI, the REST API and MCP in agreement.

## 6. Each thing is stored in one place

- **Per-user preferences** (theme, hotkeys, sidebar tabs) go in server-side
  user settings, so they follow the user across devices.
- **Per-device conveniences** (the open/closed state of a panel, a sidebar
  width) go in `localStorage`, with every access wrapped in try/catch.
- **Content** (notes, todos) goes in the database or note files, never in
  settings.
- **Nothing is shared between deployments**: each Fly app has its own database
  (`readmes/deployments.md`).

## Checklist for a new entity or feature

- [ ] Does it get retired? Then it gets `deprecated_at` plus deprecate and
      reactivate endpoints before it gets a delete button.
- [ ] Do the columns follow the additive rule (nullable or defaulted, and in the
      guarded `ALTER TABLE` block)?
- [ ] Is it reachable by API, and are the manual, scopes and MCP tool updated
      together?
- [ ] Is it deny-by-default for tokens and members, and does the regression
      gate still pass?
- [ ] Is state stored in the right place (server settings, device, or database)?
