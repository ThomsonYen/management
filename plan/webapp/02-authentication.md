# 02 — Authentication

Single-user password login now, architected so multi-user is an additive migration later. Cookie-based server-side sessions (not JWT): the SPA and API are same-origin, cookies ride along automatically with axios and `navigator.sendBeacon` (the recording flush path keeps working unchanged), and nothing sensitive touches localStorage.

## Dependencies

Add to `backend/requirements.txt`:

- `argon2-cffi==25.1.0` — argon2id is the OWASP first-choice password hash; actively maintained, prebuilt wheels for macOS arm64 and Linux (no compiler in the Docker build). Use directly (`from argon2 import PasswordHasher`). Avoid `passlib` (unmaintained, broken with modern bcrypt releases).
- No session-signing library (server-side sessions, not signed cookies) and no rate-limit library (a ~20-line in-memory limiter suffices for a single-process app).

## Schema

New models in `backend/main.py` alongside the existing ones. The app already uses `Base.metadata.create_all` + ad-hoc startup migrations, so no migration tooling is needed.

```python
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)      # argon2id encoded string
    created_at = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String, unique=True, nullable=False)  # sha256(token); never the raw token
    created_at = Column(String, nullable=False)
    last_seen_at = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)
    user_agent = Column(String, default="")
```

Seed the single user with `backend/scripts/create_user.py` (`python scripts/create_user.py <username>`, prompts for password, upserts). Run once locally; the row travels to Fly inside the migrated DB.

## Session mechanism: server-side sessions (opaque token), not signed cookies

- Token: `secrets.token_urlsafe(32)`; store `hashlib.sha256(token.encode()).hexdigest()` in `auth_sessions`.
- Cookie: `session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7776000` (90 days). `Secure` toggled by `COOKIE_SECURE` env for plain-HTTP local testing.
- **Rolling expiry with write throttling:** on each authenticated request, if `last_seen_at` is >1 hour old, update it, push `expires_at` to now+90d, and re-issue the cookie with fresh Max-Age. The phone never logs out unless unused for 90 days, without a SQLite write per request.
- Cleanup: delete expired session rows in the existing lifespan hook (startup + daily).

Why not signed cookies (itsdangerous) or JWT: revocability. Logout, "log out all devices", and panic revocation are row deletes; signed tokens are irrevocable until expiry unless the secret rotates (killing all sessions). One indexed SQLite lookup per request is free at single-user traffic. The offline-tolerant-PWA story is identical either way.

## Endpoints

```python
@app.post("/auth/login")     # {"username": str, "password": str} → UserOut + Set-Cookie
    # rate-limit check → argon2 verify → create AuthSession → set cookie
    # constant-ish time: verify against a dummy hash when the username is unknown

@app.post("/auth/logout")    # delete the session row, clear cookie

@app.get("/auth/me")         # returns request.state.user (set by middleware)
```

## Protecting all 62 routes: one middleware, zero per-route churn

The app is single-file with module-level `@app.get/post` decorators (no `APIRouter`s), so an app-level dependency has no clean exemption mechanism. A Starlette HTTP middleware with a public-path allowlist is one self-contained block:

```python
PUBLIC_PATHS = {"/auth/login", "/healthz"}

@app.middleware("http")
async def require_auth(request: Request, call_next):
    if request.url.path in PUBLIC_PATHS or request.method == "OPTIONS":
        return await call_next(request)
    user = _resolve_session(request.cookies.get("session"))  # sha256 lookup + expiry + rolling refresh
    if user is None:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    request.state.user = user
    return await call_next(request)
```

- **Mount note:** in production `main.app` is mounted under `/api` by `serve.py`. Current Starlette keeps `scope["path"]` as the full path (`/api/auth/login`) and puts the prefix in `scope["root_path"]`, so the middleware strips `root_path` before matching `PUBLIC_PATHS` — verified by running the all-routes regression test (below) against `serve:app` too.
- Also add a `get_current_user(request) -> User` dependency (reads `request.state.user`) for routes that will eventually need the user object — this is the seam for multi-user later.
- Cheap regression test: a script iterating `app.routes`, asserting 401 without a cookie on every non-public route. Run locally on `main:app` and on `serve:app`.

## CSRF posture

- `SameSite=Lax` is the primary defense; app and API are strictly same-origin in prod, and an installed iOS PWA is same-origin. Don't use `Strict` — it drops the cookie on external-link navigations into the PWA.
- Lax still sends cookies on top-level GET navigations, so GETs must stay side-effect-free (they are; the risky mutations are POST/DELETE).
- Belt-and-suspenders in the same middleware: for non-GET/HEAD requests, if an `Origin` header is present it must equal `APP_ORIGIN` (env). `sendBeacon` sends `Origin`, so the audio-flush passes. This avoids token-based CSRF machinery entirely.

## Login rate limiting

In-process (valid because deployment is exactly one uvicorn worker — see [03-deployment-fly.md](03-deployment-fly.md)): `dict[ip, deque[timestamps]]`, 5 failed attempts / 15 min / IP, `time.sleep(0.5)` on failure, 429 + `Retry-After`. Real client IP behind the Fly proxy: run uvicorn with `--proxy-headers --forwarded-allow-ips "*"` (only fly-proxy can reach the container over the private network) or read the `Fly-Client-IP` header.

## Frontend touchpoints

- **`frontend/src/pages/LoginPage.tsx`** (new): minimal username/password form → `POST /api/auth/login`. Set `autocomplete="username"` / `autocomplete="current-password"` so the iOS password manager works in standalone PWA mode.
- **`frontend/src/App.tsx`**: extract the current shell (aside + main + modals) into an `AppShell` component. `/login` renders outside the shell (no authed queries firing). Everything else wraps in **`RequireAuth`** (`frontend/src/components/RequireAuth.tsx`): `useQuery(['session'], () => api.get('/auth/me'))` → splash while loading, `<Navigate to="/login" state={{from: location}}/>` on 401, children otherwise. Add a catch-all `<Route path="*" element={<Navigate to="/"/>}/>` (currently missing — a stale PWA deep-link would render an empty pane).
- **`frontend/src/api.ts`**: axios response interceptor — on 401 (excluding the session probe and when already on `/login`): clear the React Query cache and `window.location.assign('/login?next=' + path)` (avoid importing the router into api.ts).
- **Logout**: button in `SettingsPage` (and later the mobile More sheet) → `POST /auth/logout` → clear cache → `/login`.
- `RecordingContext.tsx`'s `sendBeacon` needs no change — same-origin beacons carry cookies.

## Multi-user later (documented, not built now)

1. Add `user_id` FK columns to the 11 data models (plus `owner_id` on vaults); backfill everything to user 1 in a startup migration.
2. Change query call sites to filter by `get_current_user(request).id` — the dependency seam already exists.
3. Move `user_settings.json` into a `user_settings` table keyed by `user_id`.
4. Add registration/invite endpoints as desired.

Nothing in the session/middleware design changes — that is why `auth_sessions` references `users.id` from day one.

## Verification checklist

- [ ] All-routes script: every non-public route 401s without a cookie (against both `main:app` and `serve:app`).
- [ ] Login sets an httpOnly cookie; `/auth/me` returns the user; logout invalidates the session row (replay of the old cookie → 401).
- [ ] 6th failed login within 15 min → 429.
- [ ] Recording flush via `sendBeacon` lands while logged in (record, close tab, check audio list).
- [ ] Cross-origin `curl -X POST` with a forged `Origin` header → rejected.
- [ ] Session survives >1 h of use with only occasional `last_seen_at` writes (check DB), and the cookie Max-Age refreshes.
- [ ] On iPhone (via tailscale serve): login persists across Safari relaunch; after 48 h the rolling session still holds.
