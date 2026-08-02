"""Regression check: every route except PUBLIC_PATHS must 401 without a session cookie.

Usage:
    python scripts/check_auth.py            # checks main:app
    python scripts/check_auth.py serve      # checks serve:app (production topology)
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.routing import APIRoute  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def check(app, base: str = "") -> int:
    client = TestClient(app, raise_server_exceptions=False)
    failures = 0
    checked = 0
    for route in main.app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path in main.PUBLIC_PATHS:
            continue
        # Fill path params with a dummy id.
        path = base + re.sub(r"\{[^}]+\}", "1", route.path)
        for method in route.methods - {"HEAD", "OPTIONS"}:
            checked += 1
            resp = client.request(method, path)
            if resp.status_code != 401:
                failures += 1
                print(f"FAIL {method:6} {path} -> {resp.status_code}")
    print(f"{checked} route/method pairs checked, {failures} failures")
    return failures


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        import serve

        raise SystemExit(check(serve.app, base="/api"))
    raise SystemExit(check(main.app))
