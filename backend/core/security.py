"""Password hashing (argon2), session tokens (JWT) and at-rest encryption of DB credentials (Fernet)."""
from __future__ import annotations

import secrets
import string
import time
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet

from backend.config import get_settings

_ph = PasswordHasher()


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(hashed: str, pw: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def create_token(user_id: uuid.UUID, email: str) -> str:
    s = get_settings()
    now = int(time.time())
    payload = {"sub": str(user_id), "email": email, "iat": now, "exp": now + s.jwt_ttl_minutes * 60}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])


# ---------- tenant credentials ----------

def _fernet() -> Fernet:
    return Fernet(get_settings().credentials_key.encode())


def encrypt_secret(plain: str) -> bytes:
    return _fernet().encrypt(plain.encode())


def decrypt_secret(token: bytes) -> str:
    return _fernet().decrypt(bytes(token)).decode()


def generate_db_password(length: int = 32) -> str:
    # URL/DSN-safe alphabet, no quotes so it can never break out of a SQL literal either.
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
