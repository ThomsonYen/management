"""Regression check for member accounts.

Every route not in main._MEMBER_ROUTES must answer 403 "Owner only" to a
member, and the member-reachable routes must scope their data: a member sees
only todos assigned to their person (plus granted project subtrees), only
notes shared with them (plus attended meetings when enabled), never the
owner's focus list, transcripts, audio, private person notes or a
non-visible id (404, indistinguishable from a missing one).

Usage:
    python scripts/check_member_access.py            # checks main:app
    python scripts/check_member_access.py serve      # checks serve:app (production topology)

Runs against a throwaway database: DATA_DIR is pointed at a temp dir before
main is imported, so the dev and prod data are never touched.
"""

import os
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="mgmt-member-check-")
os.environ["DATA_DIR"] = _TMP
os.environ["BACKUP_LOOP_ENABLED"] = "0"
os.environ["COOKIE_SECURE"] = "0"
_backend_dir = Path(__file__).parent.parent.resolve()
if Path(_TMP).resolve() in (Path("/data"), _backend_dir):
    sys.exit("refusing to run against real data")

sys.path.insert(0, str(_backend_dir))

from fastapi.routing import APIRoute  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import mcp_server  # noqa: E402

OWNER_PW = "ownerpass123"
ALICE_PW = "alicepass123"
BOB_PW = "bobpass1234"

_failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        _failures.append(msg)
        print(f"FAIL {msg}")


def _seed_owner() -> None:
    with main.SessionLocal() as db:
        db.add(main.User(username="owner", password_hash=main._password_hasher.hash(OWNER_PW), role="owner"))
        db.commit()


def run(app, base: str = "") -> int:
    api = base  # REST prefix (/api under serve); MCP/OAuth routes always live at the origin root
    _seed_owner()
    with TestClient(app, raise_server_exceptions=False) as owner:  # `with` runs lifespan (managed vault)
        alice = TestClient(app, raise_server_exceptions=False)
        bob = TestClient(app, raise_server_exceptions=False)
        anon = TestClient(app, raise_server_exceptions=False)

        r = owner.post(f"{api}/auth/login", json={"username": "owner", "password": OWNER_PW})
        check(r.status_code == 200 and r.json()["role"] == "owner", f"owner login -> {r.status_code} {r.text}")

        # ── fixtures (as the owner, through the API) ───────────────────────
        def person(name):
            return owner.post(f"{api}/persons", json={"name": name}).json()["id"]

        def project(name, parent_id=None):
            return owner.post(f"{api}/projects", json={"name": name, "parent_id": parent_id}).json()["id"]

        def todo(title, **kw):
            r = owner.post(f"{api}/todos", json={"title": title, **kw})
            assert r.status_code == 200, r.text
            return r.json()["id"]

        A, B, C = person("Alice"), person("Bob"), person("Carol")
        P = project("P")
        P1 = project("P1", parent_id=P)
        Q = project("Q")
        R = project("R")  # no visible todos: invisible to members
        t_c_Q = todo("carol in Q", assignee_id=C, project_id=Q)
        t_a_P = todo("alice in P", assignee_id=A, project_id=P, blocked_by_ids=[t_c_Q], is_focused=True)
        t_b_P1 = todo("bob in P1", assignee_id=B, project_id=P1)
        t_none_P = todo("unassigned in P", project_id=P)
        t_a_Q = todo("alice in Q", assignee_id=A, project_id=Q)
        t_a_deleted = todo("alice deleted", assignee_id=A)
        owner.delete(f"{api}/todos/{t_a_deleted}")
        t_d = todo("nobody, no project")
        sub_a = owner.post(f"{api}/todos/{t_a_P}/subtodos", json={"title": "sub a"}).json()["id"]
        sub_b = owner.post(f"{api}/todos/{t_b_P1}/subtodos", json={"title": "sub b"}).json()["id"]
        sub_c = owner.post(f"{api}/todos/{t_c_Q}/subtodos", json={"title": "sub c"}).json()["id"]

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        def note(title, **kw):
            r = owner.post(f"{api}/notes", json={"title": title, **kw})
            assert r.status_code == 200, r.text
            return r.json()["id"]

        n_shared = note("shared note", content="alpha SHAREDWORD beta")
        n_private = note("private note", content="PRIVATEWORD only")
        m_attended = note("1:1 with alice", kind="meeting", date=today, attendee_ids=[A],
                          todo_ids=[t_c_Q], project_ids=[R], content="meeting ATTENDEDWORD")
        m_other = note("1:1 with bob", kind="meeting", date=today, attendee_ids=[B], content="OTHERWORD")
        m_hidden = note("old 1:1 with alice", kind="meeting", date=today, attendee_ids=[A], content="HIDDENWORD")
        owner.delete(f"{api}/notes/{m_hidden}")

        # ── invites → member accounts ─────────────────────────────────────
        r = owner.post(f"{api}/admin/invites", json={"person_id": A})
        check(r.status_code == 200, f"create invite -> {r.status_code} {r.text}")
        alice_token = r.json()["token"]
        r = anon.post(f"{api}/auth/invite/lookup", json={"token": alice_token})
        check(r.status_code == 200 and r.json()["person_name"] == "Alice", f"invite lookup -> {r.status_code} {r.text}")
        r = alice.post(f"{api}/auth/invite/accept", json={"token": alice_token, "username": "alice", "password": ALICE_PW})
        check(r.status_code == 200 and r.json()["role"] == "member" and r.json()["person_id"] == A,
              f"invite accept -> {r.status_code} {r.text}")
        alice_id = r.json()["id"]
        r = anon.post(f"{api}/auth/invite/accept", json={"token": alice_token, "username": "alice2", "password": ALICE_PW})
        check(r.status_code == 404, f"second accept of a used invite -> {r.status_code}")
        r = owner.post(f"{api}/admin/invites", json={"person_id": A})
        check(r.status_code == 409, f"invite for an already-linked person -> {r.status_code}")

        r = owner.post(f"{api}/admin/invites", json={"person_id": B})
        bob_token = r.json()["token"]
        r = bob.post(f"{api}/auth/invite/accept", json={"token": bob_token, "username": "Owner", "password": BOB_PW})
        check(r.status_code == 409, f"username taken (case-insensitive) -> {r.status_code}")
        r = bob.post(f"{api}/auth/invite/accept", json={"token": bob_token, "username": "bob", "password": BOB_PW})
        check(r.status_code == 200, f"bob accept -> {r.status_code} {r.text}")
        bob_id = r.json()["id"]

        # grants: alice sees project P (and P1), the shared note, and meetings she attended; bob is view-only
        for kind, target in (("project", P), ("note", n_shared)):
            r = owner.post(f"{api}/admin/users/{alice_id}/grants", json={"kind": kind, "target_id": target})
            check(r.status_code == 200, f"grant {kind} -> {r.status_code} {r.text}")
        r = owner.post(f"{api}/admin/users/{alice_id}/grants", json={"kind": "project", "target_id": P})
        check(r.status_code == 200, "granting twice is idempotent")
        r = owner.put(f"{api}/admin/users/{alice_id}", json={"see_attended_meetings": True})
        check(r.status_code == 200 and r.json()["see_attended_meetings"] is True, f"enable meetings -> {r.status_code}")
        r = owner.put(f"{api}/admin/users/{bob_id}", json={"access_level": "view"})
        check(r.status_code == 200 and r.json()["access_level"] == "view", f"bob view-only -> {r.status_code}")
        r = owner.get(f"{api}/admin/users")
        check(r.status_code == 200 and {u["username"] for u in r.json()["users"]} == {"owner", "alice", "bob"},
              f"admin users list -> {r.status_code}")
        check(len([g for u in r.json()["users"] if u["username"] == "alice" for g in u["grants"]]) == 2, "alice has 2 grants")

        r = alice.get(f"{api}/auth/me")
        check(r.status_code == 200 and r.json()["person_name"] == "Alice" and r.json()["access_level"] == "edit",
              f"alice /auth/me -> {r.status_code} {r.text}")

        # ── todos: scoped lists ───────────────────────────────────────────
        r = alice.get(f"{api}/todos")
        ids = {t["id"] for t in r.json()}
        check(ids == {t_a_P, t_b_P1, t_none_P, t_a_Q}, f"alice GET /todos ids {ids}")
        check(all(t["is_focused"] is False and t["focus_order"] == 0 for t in r.json()), "focus is blanked for members")
        check(all(t["deleted_at"] is None for t in r.json()), "no deleted_at for members")
        ta = next(t for t in r.json() if t["id"] == t_a_P)
        check(ta["blocked_by_ids"] == [] and ta["is_blocked"] is True, "blocker ids blanked, is_blocked truthful")
        check({t["id"] for t in alice.get(f"{api}/todos", params={"assignee_id": C}).json()} == set(), "assignee_id=C filter -> []")
        check({t["id"] for t in alice.get(f"{api}/todos", params={"is_focused": "true"}).json()} == ids, "is_focused filter ignored")
        r = bob.get(f"{api}/todos")
        check({t["id"] for t in r.json()} == {t_b_P1}, f"bob GET /todos ids {[t['id'] for t in r.json()]}")

        # ── direct ids: invisible == missing ──────────────────────────────
        bodies = []
        for tid in (t_c_Q, t_a_deleted, t_d, 999999):
            r = alice.get(f"{api}/todos/{tid}")
            check(r.status_code == 404, f"GET /todos/{tid} as alice -> {r.status_code}")
            bodies.append(r.json())
        check(all(b == bodies[0] for b in bodies), "404 bodies are identical")
        check(alice.get(f"{api}/todos/{t_a_P}").status_code == 200, "own todo readable")
        check(alice.get(f"{api}/todos/{t_none_P}").status_code == 200, "project-granted todo readable")

        # ── PUT allow-list ────────────────────────────────────────────────
        for field, value in (("title", "renamed"), ("description", "d"), ("deadline", "2030-01-01"),
                             ("importance", "high"), ("estimated_hours", 2.5), ("status", "todo"), ("project_id", P1)):
            r = alice.put(f"{api}/todos/{t_a_P}", json={field: value})
            check(r.status_code == 200, f"alice PUT {field} on own todo -> {r.status_code} {r.text}")
        r = alice.put(f"{api}/todos/{t_a_P}", json={"project_id": Q})
        check(r.status_code == 200, f"move own todo to a visible (label) project -> {r.status_code}")
        r = alice.put(f"{api}/todos/{t_a_P}", json={"project_id": R})
        check(r.status_code == 403, f"move own todo to an invisible project -> {r.status_code}")
        for field, value in (("assignee_id", B), ("is_focused", True), ("focus_order", 3), ("blocked_by_ids", [t_a_Q])):
            r = alice.put(f"{api}/todos/{t_a_P}", json={field: value})
            check(r.status_code == 403 and field in r.json()["detail"], f"alice PUT {field} -> {r.status_code} {r.text}")
        check(alice.put(f"{api}/todos/{t_none_P}", json={"status": "done"}).status_code == 403, "edit unassigned granted todo -> 403")
        check(alice.put(f"{api}/todos/{t_b_P1}", json={"status": "done"}).status_code == 403, "edit someone else's granted todo -> 403")
        check(alice.put(f"{api}/todos/{t_c_Q}", json={"status": "done"}).status_code == 404, "edit invisible todo -> 404")
        check(bob.put(f"{api}/todos/{t_b_P1}", json={"status": "done"}).status_code == 403, "view-only member edit -> 403")
        r = alice.put(f"{api}/todos/{t_a_Q}", json={"status": "done"})
        check(r.status_code == 200 and r.json()["done_at"], "alice completes her todo")
        owner.put(f"{api}/todos/{t_c_Q}", json={"status": "done"})
        done_ids = {t["id"] for t in alice.get(f"{api}/todos/recently-done").json()}
        check(done_ids == {t_a_Q}, f"recently-done scoped {done_ids}")

        # ── create ────────────────────────────────────────────────────────
        check(alice.post(f"{api}/todos", json={"title": "x", "assignee_id": B}).status_code == 403, "create for someone else -> 403")
        check(alice.post(f"{api}/todos", json={"title": "x", "project_id": R}).status_code == 403, "create in invisible project -> 403")
        check(alice.post(f"{api}/todos", json={"title": "x", "is_focused": True}).status_code == 403, "create focused -> 403")
        r = alice.post(f"{api}/todos", json={"title": "mine", "project_id": Q})
        check(r.status_code == 200 and r.json()["assignee_id"] == A and r.json()["is_focused"] is False,
              f"member create -> {r.status_code} {r.text}")
        check(bob.post(f"{api}/todos", json={"title": "x"}).status_code == 403, "view-only create -> 403")

        # ── subtodos ──────────────────────────────────────────────────────
        check(alice.post(f"{api}/todos/{t_b_P1}/subtodos", json={"title": "s"}).status_code == 403, "subtodo on granted todo -> 403")
        check(alice.post(f"{api}/todos/{t_c_Q}/subtodos", json={"title": "s"}).status_code == 404, "subtodo on invisible todo -> 404")
        check(alice.put(f"{api}/subtodos/{sub_c}", json={"done": True}).status_code == 404, "PUT invisible subtodo -> 404")
        check(alice.put(f"{api}/subtodos/{sub_b}", json={"done": True}).status_code == 403, "PUT someone else's subtodo -> 403")
        check(alice.delete(f"{api}/subtodos/{sub_b}").status_code == 403, "DELETE someone else's subtodo -> 403")
        check(alice.put(f"{api}/subtodos/{sub_a}", json={"done": True}).status_code == 200, "PUT own subtodo -> 200")
        check(bob.put(f"{api}/subtodos/{sub_b}", json={"done": True}).status_code == 403, "view-only subtodo -> 403")

        # ── projects ──────────────────────────────────────────────────────
        r = alice.get(f"{api}/projects")
        projs = {p["id"]: p for p in r.json()}
        check(set(projs) == {P, P1, Q}, f"alice projects {sorted(projs)}")
        check(all(set(p) == {"id", "name", "parent_id"} for p in projs.values()), "member project shape is id/name/parent_id only")
        check(projs[P1]["parent_id"] == P and projs[Q]["parent_id"] is None, "member project parents")
        r = bob.get(f"{api}/projects")
        check({p["id"]: p["parent_id"] for p in r.json()} == {P1: None}, f"bob projects {r.json()} (parent hidden)")

        # ── notes ─────────────────────────────────────────────────────────
        ids = {n["id"] for n in alice.get(f"{api}/notes").json()}
        check(ids == {n_shared, m_attended}, f"alice GET /notes {ids}")
        check(bob.get(f"{api}/notes").json() == [], "bob sees no notes")
        for nid in (n_private, m_other, m_hidden, 999999):
            check(alice.get(f"{api}/notes/{nid}").status_code == 404, f"GET /notes/{nid} as alice -> 404")
        r = alice.get(f"{api}/notes/{m_attended}")
        n = r.json()
        check(r.status_code == 200 and "ATTENDEDWORD" in n["content"], "attended meeting readable")
        check(n["transcript"] is None and n["audio_files"] == [], "no transcript/audio for members")
        check(n["todo_ids"] == [] and n["project_ids"] == [], f"invisible links stripped {n['todo_ids']} {n['project_ids']}")
        check(n["vault_root_path"] is None and n["relative_path"] is None and n["filename"] is None, "no paths for members")
        check(n["attendee_names"] == ["Alice"], "attendees kept")
        check([x["id"] for x in alice.get(f"{api}/notes/search", params={"q": "PRIVATEWORD"}).json()] == [], "search never reads unshared bodies")
        check([x["id"] for x in alice.get(f"{api}/notes/search", params={"q": "SHAREDWORD"}).json()] == [n_shared], "search finds shared note")
        check([x["id"] for x in alice.get(f"{api}/notes/search", params={"q": "HIDDENWORD"}).json()] == [], "search skips hidden notes")
        check(alice.get(f"{api}/notes/{n_shared}/audio/x/download").status_code == 403, "audio download -> 403")
        owner.put(f"{api}/admin/users/{alice_id}", json={"see_attended_meetings": False})
        check({x["id"] for x in alice.get(f"{api}/notes").json()} == {n_shared}, "meetings vanish when the flag is off")
        owner.put(f"{api}/admin/users/{alice_id}", json={"see_attended_meetings": True})

        # ── settings isolation ────────────────────────────────────────────
        owner_before = owner.get(f"{api}/config/settings").json()
        tz_before = main.get_user_timezone()
        r = alice.put(f"{api}/config/settings", json={"timezone": "Asia/Tokyo", "theme": "dark"})
        check(r.status_code == 200 and r.json()["timezone"] == "Asia/Tokyo", f"member settings PUT -> {r.status_code}")
        check(owner.get(f"{api}/config/settings").json() == owner_before, "owner settings untouched by a member")
        check(main.get_user_timezone() == tz_before, "server timezone (owner's) untouched")
        check((Path(_TMP) / "user_settings" / f"{alice_id}.json").exists(), "member settings file written")

        # ── tokens & MCP are owner-only ───────────────────────────────────
        r = alice.post(f"{api}/api-tokens", json={"name": "t", "scopes": ["read"]})
        check(r.status_code == 403, f"member POST /api-tokens -> {r.status_code}")
        raw_member = main.API_TOKEN_PREFIX + "membertoken0000000000000000000000000000000"
        with main.SessionLocal() as db:
            now = datetime.now(timezone.utc)
            db.add(main.ApiToken(user_id=alice_id, name="smuggled", token_hash=main._hash_token(raw_member), scopes="read",
                                 created_at=now.isoformat(), expires_at=now.replace(year=now.year + 1).isoformat()))
            db.commit()
        r = anon.get(f"{api}/todos", headers={"Authorization": f"Bearer {raw_member}"})
        check(r.status_code == 401, f"member token on REST -> {r.status_code}")
        r = anon.post("/mcp", headers={"Authorization": f"Bearer {raw_member}", "Accept": "application/json, text/event-stream"},
                      json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        check(r.status_code == 401, f"member token on /mcp -> {r.status_code}")
        r = owner.post(f"{api}/api-tokens", json={"name": "t", "scopes": ["read"]})
        owner_pat = r.json()["token"]
        r = anon.get(f"{api}/todos", headers={"Authorization": f"Bearer {owner_pat}"})
        check(r.status_code == 200 and len(r.json()) == 7, f"owner token on REST -> {r.status_code} n={len(r.json()) if r.status_code == 200 else '?'}")
        # OAuth consent must refuse member credentials
        try:
            from mcp.shared.auth import OAuthClientInformationFull
            from mcp.server.auth.provider import AuthorizationParams
            from pydantic import AnyUrl
            client_info = OAuthClientInformationFull(client_id="c-test", client_name="Test client",
                                                     redirect_uris=[AnyUrl("http://localhost:1/cb")])
            params = AuthorizationParams(state=None, scopes=["read"], code_challenge="abc",
                                         redirect_uri=AnyUrl("http://localhost:1/cb"),
                                         redirect_uri_provided_explicitly=True, resource=None)
            mcp_server._pending["req-test"] = (time.monotonic(), client_info, params)
            r = anon.post("/oauth/consent", data={"req": "req-test", "username": "alice", "password": ALICE_PW, "scopes": ["read"]})
            check(r.status_code == 200 and "owner only" in r.text.lower(), f"consent with member creds -> {r.status_code}")
            with main.SessionLocal() as db:
                n_tokens = db.query(main.ApiToken).filter(main.ApiToken.user_id == alice_id).count()
            check(n_tokens == 1, f"consent minted no token for the member (rows={n_tokens})")
        except Exception as e:  # the mcp library's parameter shapes may change; don't fail the whole check on that
            print(f"WARN consent check skipped: {e!r}")

        # ── member audit ──────────────────────────────────────────────────
        r = owner.get(f"{api}/admin/users/{alice_id}/audit")
        check(r.status_code == 200 and any(e["method"] == "PUT" and e["path"].startswith("/todos/") for e in r.json()),
              "member mutations are audited")

        # ── lifecycle ─────────────────────────────────────────────────────
        owner.put(f"{api}/admin/users/{alice_id}", json={"is_active": False})
        check(alice.get(f"{api}/auth/me").status_code == 401, "disabled member -> 401")
        check(alice.post(f"{api}/auth/login", json={"username": "alice", "password": ALICE_PW}).status_code == 401, "disabled member cannot log in")
        owner.put(f"{api}/admin/users/{alice_id}", json={"is_active": True})
        r = alice.post(f"{api}/auth/login", json={"username": "alice", "password": ALICE_PW})
        check(r.status_code == 200, f"re-enabled member logs in -> {r.status_code}")
        r = alice.post(f"{api}/auth/change-password", json={"current_password": "wrong", "new_password": "newpass12345"})
        check(r.status_code == 400, f"change password with wrong current -> {r.status_code}")
        r = alice.post(f"{api}/auth/change-password", json={"current_password": ALICE_PW, "new_password": "newpass12345"})
        check(r.status_code == 200, f"change password -> {r.status_code}")
        check(alice.get(f"{api}/auth/me").status_code == 200, "current session survives a password change")
        owner.delete(f"{api}/persons/{B}")
        check(bob.get(f"{api}/auth/me").status_code == 401, "archiving a person disables their member account")
        check(owner.delete(f"{api}/persons/{B}/purge").status_code == 409, "purge refuses while an account is linked")
        check(owner.get(f"{api}/todos/{t_c_Q}").status_code == 200, "owner unaffected")
        check(owner.get(f"{api}/agent/digest").status_code == 200, "owner digest works")
        r = owner.put(f"{api}/admin/users/1", json={"access_level": "view"})
        check(r.status_code == 403, f"owner account is not manageable -> {r.status_code}")
        r = owner.delete(f"{api}/admin/users/{bob_id}")
        check(r.status_code == 200, f"delete member -> {r.status_code}")
        check(owner.delete(f"{api}/persons/{B}/purge").status_code == 200, "purge works once the account is gone")

        # ── invites: bogus + rate limit ───────────────────────────────────
        check(anon.post(f"{api}/auth/invite/lookup", json={"token": "bogus"}).status_code == 404, "bogus invite -> 404")
        got_429 = False
        for _ in range(7):
            if anon.post(f"{api}/auth/invite/lookup", json={"token": "bogus"}).status_code == 429:
                got_429 = True
                break
        check(got_429, "invite lookups are rate limited")

        # ── route sweep (last: it fires real requests at every route) ─────
        fill = {"todo_id": t_a_P, "note_id": n_shared, "subtodo_id": sub_a, "person_id": A, "project_id": P,
                "user_id": alice_id, "grant_id": 1, "invite_id": 1, "token_id": 1, "vault_id": 1, "date": today,
                "filename": "x.mp3"}
        swept = 0
        for route in main.app.routes:
            if not isinstance(route, APIRoute) or route.path in main.PUBLIC_PATHS:
                continue
            path = re.sub(r"\{([^}:]+)(?::[^}]*)?\}", lambda m: str(fill.get(m.group(1), 1)), route.path)
            for method in route.methods - {"HEAD", "OPTIONS"}:
                if method == "POST" and path == "/auth/logout":
                    continue  # keep alice signed in for the rest of the sweep
                swept += 1
                resp = alice.request(method, base + path)
                allowed = main._member_route_allowed(method, path)
                if allowed:
                    check(resp.status_code not in (401, 403) or (resp.status_code == 403 and resp.json().get("detail") != "Owner only"),
                          f"{method} {path} is member-allowed but got {resp.status_code} {resp.text[:80]}")
                else:
                    check(resp.status_code == 403 and resp.json().get("detail") == "Owner only",
                          f"{method} {path} should be owner-only, got {resp.status_code} {resp.text[:80]}")
        for extra in ("/openapi.json", "/docs", "/redoc"):
            resp = alice.get(base + extra)
            check(resp.status_code == 403, f"GET {extra} as member -> {resp.status_code}")
        print(f"{swept} route/method pairs swept")
    return len(_failures)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        import serve

        n = run(serve.app, base="/api")
    else:
        n = run(main.app)
    print(f"{n} failure(s)")
    raise SystemExit(1 if n else 0)
