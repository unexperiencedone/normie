"""Shared API dependencies: current user (from the httpOnly session cookie), project ownership, rate limits."""
from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque

import jwt
from fastapi import Depends, HTTPException, Request

from backend.core import db
from backend.core.security import decode_token

COOKIE = "normie_session"


class User(dict):
    @property
    def id(self) -> uuid.UUID:
        return self["user_id"]


async def current_user(request: Request) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "not signed in")
    try:
        payload = decode_token(token)
        uid = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "session expired") from None
    row = await db.control().fetchrow("SELECT user_id, email, created_at FROM users WHERE user_id=$1", uid)
    if not row:
        raise HTTPException(401, "unknown user")
    return User(row)


async def project_for(project_id: uuid.UUID, user: User = Depends(current_user)) -> dict:
    row = await db.control().fetchrow(
        """SELECT project_id, name, description, db_name, status, auto_approve_low_risk, schema_version, created_at
           FROM projects WHERE project_id=$1 AND owner_id=$2 AND status <> 'deleted'""", project_id, user.id)
    if not row:
        raise HTTPException(404, "project not found")
    if row["status"] != "ready":
        raise HTTPException(409, f"project is {row['status']}")
    return dict(row)


class RateLimiter:
    """Sliding-window limiter, in-process (Redis-backed in a multi-replica deployment)."""

    def __init__(self, limit: int, window_s: float):
        self.limit, self.window = limit, window_s
        self.hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(429, "too many requests, slow down", headers={"Retry-After": str(int(self.window))})
        q.append(now)


login_limiter = RateLimiter(10, 60)
chat_limiter = RateLimiter(20, 60)
