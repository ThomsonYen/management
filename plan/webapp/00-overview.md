# Web App Plan — Overview

Take the local-only personal management app (FastAPI + SQLite backend, Vite/React frontend) onto the public web with a login, hosted as a container on Fly.io, and make it usable from an iPhone as an installable PWA.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | **Fly.io container** (single machine + persistent volume) | Managed TLS/deploys, no server administration; SQLite + on-disk media fit a single pinned machine with a volume. ~$4–8/mo. |
| Auth | **Single-user password now, multi-user-ready** | One `users` row, argon2 hash, server-side cookie sessions. No `user_id` FKs on data tables yet, but sessions reference `users.id` from day one so multi-user is an additive migration (see [02-authentication.md](02-authentication.md)). |
| Mobile | **PWA** (manifest + service worker + responsive rework) | One codebase, installable via Add to Home Screen, mic recording works over HTTPS. |
| Platform | **iPhone** (iOS Safari) | iOS PWA quirks are in scope; Android is incidental. |

## Current vs target architecture

**Today (local only):**

```
Browser ── https://dev.localhost:5173 (Vite dev server, mkcert certs)
                 │  serves SPA
                 └─ proxies /api/* → http://127.0.0.1:8001 (strips /api)
                                        uvicorn main:app --reload
                                        SQLite + media files inside backend/
```

- All 62 API endpoints unauthenticated; no user concept anywhere.
- Live OpenAI key in `project_config.yaml` (tracked by git).
- ~1 GB `backend/meeting_audio/` + `backend/management.db` on the laptop.
- Desktop-only UI (fixed sidebar, drag-and-drop, meta-key hotkeys); no PWA assets.
- Recording is webm/opus-only — would throw on iOS today.

**Target:**

```
iPhone PWA / any browser ── https://app.example.com
        │ (Fly proxy: TLS termination, force_https)
        ▼
Fly machine (shared-cpu-1x, 1GB RAM, auto-suspend)
  uvicorn serve:app :8080
    ├─ /api/* → mounted main:app (prefix stripped, auth middleware, 62 routes)
    └─ /*     → frontend/dist (StaticFiles + SPA fallback) + secure headers
  /data (10GB Fly volume): management.db (WAL), meeting_audio/, transcripts/,
                           notes/, templates/, user_settings.json
  Backups: in-app hourly loop → sqlite .backup + rclone → Tigris (S3)
           + Fly daily volume snapshots
```

Dev workflow is untouched: Vite proxy + `uvicorn main:app --reload` keep working exactly as today.

## Documents

- [_setup.md](_setup.md) — **step-by-step: zero → running on Fly.io** (local prereqs, container check, Fly app, data migration, iPhone)
- [_update.md](_update.md) — **step-by-step: shipping code changes** (local test, pre-deploy checks, `fly deploy`, rollback)

1. [01-security-hardening.md](01-security-hardening.md) — stop-the-bleeding fixes, ordered; key rotation first
2. [02-authentication.md](02-authentication.md) — users/sessions schema, cookie sessions, auth middleware, login UI, multi-user path
3. [03-deployment-fly.md](03-deployment-fly.md) — Dockerfile, `serve.py`, fly.toml, volume, secrets, data migration, backups
4. [04-pwa-foundation.md](04-pwa-foundation.md) — manifest, service worker, icons, iOS meta tags and quirks
5. [05-mobile-layout.md](05-mobile-layout.md) — mobile shell (bottom tab bar), per-page responsive passes, touch interactions
6. [06-recording-ios.md](06-recording-ios.md) — iOS MediaRecorder reality, mime fallback, wake lock, pagehide

## Phase map and ordering

Backend phases 0–3 are fully testable on the laptop before Fly exists. Frontend phase A should land before B so PWA testing exercises the real login flow.

| Phase | What | Effort | Where tested |
|---|---|---|---|
| **0** | Security stop-the-bleeding (key rotation, CORS, traceback leak, transcribe fence) | 1–2 h | local |
| **1** | Backend auth (tables, endpoints, middleware, rate limit) | ~1 day | local |
| **A** | Frontend auth wiring (LoginPage, RequireAuth, 401 interceptor) | 0.5–1 day | local + iPhone Safari via tailscale |
| **2** | Hardening + `DATA_DIR` refactor + WAL + upload cap | 3–5 h | local |
| **3** | Containerize (Dockerfile, `.dockerignore`, `serve.py`) | 3–4 h | local `docker run` |
| **4** | Fly provisioning + data migration + backups + cutover | 2–4 h + ~1 GB upload | Fly |
| **B** | PWA foundation (manifest, SW, icons, iOS metas) | 0.5–1 day | iPhone vs Fly URL |
| **C** | Mobile shell (tab bar, header, More sheet) | 1–2 days | iPhone |
| **D** | Per-page responsive passes + touch interactions (3 batches) | 2–4 days | iPhone |
| **E** | Recording hardening for iOS (independent, any time after A) | 0.5–1 day | iPhone PWA |

Total: roughly 2–3 weeks of part-time work; the app is usable on the phone (ugly but functional) after Phase 4, and pleasant after C/D.

## On-device testing rig

- Before Fly exists: expose the dev stack to the iPhone with `tailscale serve` (valid HTTPS cert, which iOS requires for mic + PWA). The repo's mkcert `dev.localhost` certs are **not** trusted by an iPhone.
- Debugging standalone/PWA mode: iPhone Settings → Safari → Advanced → Web Inspector, then Mac Safari Develop menu. This is the only way to see console errors from an installed PWA.

## Out of scope (documented, not planned)

- Multi-user accounts (migration path documented in 02).
- Native wrapper (Capacitor) — revisit only if background recording through screen-lock becomes a hard requirement; the web platform cannot do it.
- Android-specific work — the PWA will mostly just work on Chrome/Android.
