"""Connection management.

* `admin`    – superuser connection to the cluster, used ONLY for provisioning (CREATE DATABASE/ROLE).
* `control`  – pool on the control-plane database (metadata, audit, approvals).
* tenant pools – one small pool per (project, kind) where kind is owner | rw | ro.
  The agent and end users never get the owner pool directly; DDL only runs after approval.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

import asyncpg

from backend.config import get_settings
from backend.core.security import decrypt_secret

_control_pool: asyncpg.Pool | None = None
_tenant_pools: dict[tuple[uuid.UUID, str], asyncpg.Pool] = {}
_tenant_lock = asyncio.Lock()


async def _init_conn(conn: asyncpg.Connection) -> None:
    for t in ("json", "jsonb"):
        await conn.set_type_codec(t, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def admin_connect(database: str = "postgres") -> asyncpg.Connection:
    s = get_settings()
    return await asyncpg.connect(database=database, **s.admin_dsn_params)


async def init_control_plane() -> None:
    """Create the control DB if missing, apply the idempotent schema, open the pool."""
    global _control_pool
    s = get_settings()
    conn = await admin_connect()
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", s.control_db)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{s.control_db}"')
    finally:
        await conn.close()
    _control_pool = await asyncpg.create_pool(
        database=s.control_db, min_size=1, max_size=10, init=_init_conn, **s.admin_dsn_params
    )
    sql = (Path(__file__).parent / "control_schema.sql").read_text()
    async with _control_pool.acquire() as c:
        await c.execute(sql)


def control() -> asyncpg.Pool:
    if _control_pool is None:
        raise RuntimeError("control plane not initialised")
    return _control_pool


async def tenant_pool(project_id: uuid.UUID, kind: str) -> asyncpg.Pool:
    """Pool connected to the tenant DB as one of its least-privilege login roles."""
    key = (project_id, kind)
    if key in _tenant_pools:
        return _tenant_pools[key]
    async with _tenant_lock:
        if key in _tenant_pools:
            return _tenant_pools[key]
        row = await control().fetchrow(
            """SELECT p.db_name, c.db_user, c.secret_enc FROM projects p
               JOIN db_credentials c USING (project_id) WHERE p.project_id=$1 AND c.kind=$2""",
            project_id,
            kind,
        )
        if not row:
            raise LookupError(f"no {kind} credentials for project")
        s = get_settings()
        pool = await asyncpg.create_pool(
            host=s.pg_host,
            port=s.pg_port,
            database=row["db_name"],
            user=row["db_user"],
            password=decrypt_secret(row["secret_enc"]),
            min_size=0,
            max_size=5,
            init=_init_conn,
            server_settings={"application_name": f"normie-{kind}"},
        )
        _tenant_pools[key] = pool
        return pool


async def drop_tenant_pools(project_id: uuid.UUID) -> None:
    for key in [k for k in _tenant_pools if k[0] == project_id]:
        pool = _tenant_pools.pop(key)
        await pool.close()


async def close_all() -> None:
    for pool in list(_tenant_pools.values()):
        await pool.close()
    _tenant_pools.clear()
    if _control_pool:
        await _control_pool.close()
