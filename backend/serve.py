"""Production entrypoint: serves the built SPA and mounts the API under /api.

The ASGI mount strips the /api prefix exactly like the Vite dev proxy, so
routes in main.py stay prefix-free and dev (`uvicorn main:app --reload`)
is unaffected. Used by the container CMD: `uvicorn serve:app`.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from main import app as api_app

DIST = (Path(__file__).parent.parent / "frontend" / "dist").resolve()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Starlette does not run mounted sub-apps' lifespans; without this the
    # API's startup (vault reconciliation, backfills, scans) never executes.
    async with api_app.router.lifespan_context(api_app):
        yield


app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None, lifespan=lifespan)


@app.middleware("http")
async def secure_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    path = request.url.path
    if path.startswith("/assets/"):
        # Vite emits content-hashed filenames, so assets never change in place
        response.headers.setdefault(
            "Cache-Control", "public, max-age=31536000, immutable"
        )
    elif path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    else:
        # index.html and unhashed files (favicon, manifest): revalidate via ETag
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


app.mount("/api", api_app)
app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    candidate = (DIST / full_path).resolve()
    if full_path and candidate.is_file() and candidate.is_relative_to(DIST):
        return FileResponse(candidate)  # favicon, manifest, icons, sw.js
    return FileResponse(DIST / "index.html")  # SPA fallback
