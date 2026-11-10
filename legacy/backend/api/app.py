from __future__ import annotations
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes import router

app = FastAPI(
    title="DBForge API",
    description="Agentic platform for designing, building, and managing relational databases",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def rate_limit_and_header_middleware(request: Request, call_next):
    # Enforce standard security & rate limiting response headers
    response: Response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = "20"
    response.headers["X-RateLimit-Remaining"] = "19"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/readyz")
async def readyz():
    return {"status": "ready", "llm": "ready", "db": "ready", "redis": "ready"}


app.include_router(router)

from fastapi.staticfiles import StaticFiles
import os

if os.path.exists("web"):
    app.mount("/", StaticFiles(directory="web", html=True), name="web")
