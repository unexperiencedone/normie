from __future__ import annotations

import re

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.api.deps import COOKIE, User, current_user, login_limiter
from backend.config import get_settings
from backend.core import db
from backend.core.security import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Credentials(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=200)


def _set_cookie(resp: Response, token: str) -> None:
    s = get_settings()
    resp.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=s.cookie_secure,
                    max_age=s.jwt_ttl_minutes * 60, path="/")


@router.post("/register")
async def register(body: Credentials, request: Request, response: Response):
    login_limiter.check(f"reg:{request.client.host if request.client else '?'}")
    email = body.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(400, "invalid email")
    try:
        row = await db.control().fetchrow(
            "INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING user_id, email",
            email, hash_password(body.password))
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "an account with this email already exists") from None
    _set_cookie(response, create_token(row["user_id"], email))
    return {"user_id": str(row["user_id"]), "email": email}


@router.post("/login")
async def login(body: Credentials, request: Request, response: Response):
    email = body.email.strip().lower()
    login_limiter.check(f"login:{request.client.host if request.client else '?'}:{email}")
    row = await db.control().fetchrow("SELECT user_id, password_hash FROM users WHERE email=$1", email)
    if not row or not verify_password(row["password_hash"], body.password):
        raise HTTPException(401, "wrong email or password")
    _set_cookie(response, create_token(row["user_id"], email))
    return {"user_id": str(row["user_id"]), "email": email}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {"user_id": str(user.id), "email": user["email"]}
