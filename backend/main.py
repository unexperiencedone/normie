"""Normie API entry point:  uv run uvicorn backend.main:app --reload --port 8000"""
from __future__ import annotations

import os

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from contextlib import asynccontextmanager  # noqa: E402

import asyncpg  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.exceptions import HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from backend.api import routes_auth, routes_chat, routes_data, routes_projects  # noqa: E402
from backend.core import db  # noqa: E402
from backend.services.executor import ExecError, pg_error  # noqa: E402
from backend.services.sqlpolicy import PolicyError  # noqa: E402
from backend.tenancy.provision import harden_cluster  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_control_plane()
    await harden_cluster()
    yield
    await db.close_all()


app = FastAPI(title="Normie API", version="0.2.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


@app.middleware("http")
async def csrf_and_headers(request: Request, call_next):
    # Cookie auth + this custom header => a cross-site form/fetch cannot forge state-changing requests
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/"):
        if request.headers.get("x-normie-client") != "web":
            return JSONResponse({"error": {"message": "missing X-Normie-Client header"}}, status_code=403)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    return resp


def _err(status: int, payload: dict) -> JSONResponse:
    return JSONResponse({"error": payload}, status_code=status)


@app.exception_handler(ExecError)
async def exec_error(_: Request, e: ExecError):
    return _err(422 if e.payload.get("sqlstate") in ("POLICY", "APPROVAL_DRIFT") else 400, e.payload)


@app.exception_handler(PolicyError)
async def policy_error(_: Request, e: PolicyError):
    return _err(422, pg_error(e).payload)


@app.exception_handler(asyncpg.PostgresError)
async def pg_exc(_: Request, e: asyncpg.PostgresError):
    return _err(400, pg_error(e).payload)


@app.exception_handler(LookupError)
async def not_found(_: Request, e: LookupError):
    return _err(404, {"message": str(e)})


@app.exception_handler(HTTPException)
async def http_exc(_: Request, e: HTTPException):
    return JSONResponse({"error": {"message": e.detail}}, status_code=e.status_code, headers=e.headers)


@app.get("/api/healthz")
async def healthz():
    return {"ok": True}


@app.get("/api/readyz")
async def readyz():
    try:
        await db.control().fetchval("SELECT 1")
        return {"ok": True, "control_db": "up"}
    except Exception as e:
        return JSONResponse({"ok": False, "control_db": str(e)}, status_code=503)


for r in (routes_auth.router, routes_projects.router, routes_data.router, routes_data.tools_router, routes_chat.router):
    app.include_router(r, prefix="/api/v1")
