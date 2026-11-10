"""Tenant provisioning: one PostgreSQL database per project + three least-privilege login roles.

    <prefix>_owner  owns the schema; used only to apply APPROVED migrations
    <prefix>_rw     SELECT/INSERT/UPDATE/DELETE on tables (app writes, approved DML)
    <prefix>_ro     SELECT only, default_transaction_read_only=on (all reads, the agent's queries)

Passwords are random, alphanumeric (cannot break out of a SQL literal), shown to the user only on
request, and stored encrypted with Fernet in `db_credentials`.
Identifiers are derived from a random hex prefix, never from user input.
"""
from __future__ import annotations

import secrets
import uuid

import asyncpg

from backend.config import get_settings
from backend.core import db
from backend.core.security import encrypt_secret, generate_db_password

KINDS = ("owner", "rw", "ro")


def _q(ident: str) -> str:
    """Quote an identifier we generated ourselves (defence in depth)."""
    assert ident.replace("_", "").isalnum(), ident
    return f'"{ident}"'


async def harden_cluster() -> None:
    """Tenant login roles must never be able to connect to the control plane or maintenance DBs."""
    s = get_settings()
    conn = await db.admin_connect()
    try:
        for d in (s.control_db, "postgres"):
            await conn.execute(f"REVOKE CONNECT ON DATABASE {_q(d)} FROM PUBLIC")
    finally:
        await conn.close()


async def provision_project(owner_id: uuid.UUID, name: str, description: str) -> uuid.UUID:
    s = get_settings()
    prefix = "t_" + secrets.token_hex(5)
    roles = {k: f"{prefix}_{k}" for k in KINDS}
    passwords = {k: generate_db_password() for k in KINDS}

    project_id: uuid.UUID = await db.control().fetchval(
        """INSERT INTO projects (owner_id, name, description, db_name, role_prefix)
           VALUES ($1,$2,$3,$4,$4) RETURNING project_id""",
        owner_id,
        name,
        description,
        prefix,
    )
    admin = await db.admin_connect()
    try:
        for k in KINDS:
            await admin.execute(
                f"CREATE ROLE {_q(roles[k])} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION "
                f"CONNECTION LIMIT 20 PASSWORD '{passwords[k]}'"
            )
        await admin.execute(f"CREATE DATABASE {_q(prefix)} OWNER {_q(roles['owner'])} ENCODING 'UTF8'")
        await admin.execute(f"REVOKE ALL ON DATABASE {_q(prefix)} FROM PUBLIC")
        await admin.execute(f"GRANT CONNECT, TEMPORARY ON DATABASE {_q(prefix)} TO {_q(roles['rw'])}, {_q(roles['ro'])}")

        timeout = f"{s.statement_timeout_ms}ms"
        await admin.execute(f"ALTER ROLE {_q(roles['ro'])} SET default_transaction_read_only = on")
        for k in ("ro", "rw"):
            await admin.execute(f"ALTER ROLE {_q(roles[k])} SET statement_timeout = '{timeout}'")
            await admin.execute(f"ALTER ROLE {_q(roles[k])} SET lock_timeout = '3s'")
            await admin.execute(f"ALTER ROLE {_q(roles[k])} SET idle_in_transaction_session_timeout = '30s'")
        await admin.execute(f"ALTER ROLE {_q(roles['owner'])} SET statement_timeout = '60s'")
        await admin.execute(f"ALTER ROLE {_q(roles['owner'])} SET lock_timeout = '10s'")
    finally:
        await admin.close()

    tconn = await db.admin_connect(prefix)
    try:
        o, rw, ro = (_q(roles[k]) for k in KINDS)
        await tconn.execute(
            f"""
            REVOKE ALL ON SCHEMA public FROM PUBLIC;
            ALTER SCHEMA public OWNER TO {o};
            GRANT USAGE ON SCHEMA public TO {rw}, {ro};
            ALTER DEFAULT PRIVILEGES FOR ROLE {o} IN SCHEMA public GRANT SELECT ON TABLES TO {ro};
            ALTER DEFAULT PRIVILEGES FOR ROLE {o} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {rw};
            ALTER DEFAULT PRIVILEGES FOR ROLE {o} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {rw};
            ALTER DEFAULT PRIVILEGES FOR ROLE {o} IN SCHEMA public GRANT SELECT ON SEQUENCES TO {ro};
            """
        )
    finally:
        await tconn.close()

    async with db.control().acquire() as c, c.transaction():
        for k in KINDS:
            await c.execute(
                "INSERT INTO db_credentials (project_id, kind, db_user, secret_enc) VALUES ($1,$2,$3,$4)",
                project_id,
                k,
                roles[k],
                encrypt_secret(passwords[k]),
            )
        await c.execute("UPDATE projects SET status='ready' WHERE project_id=$1", project_id)
        await c.execute(
            "INSERT INTO audit_log (project_id, user_id, actor, action, ok, sql_text) VALUES ($1,$2,'system','provision',true,$3)",
            project_id,
            owner_id,
            f"CREATE DATABASE {prefix} + roles {', '.join(roles.values())}",
        )
    return project_id


async def rotate_password(project_id: uuid.UUID, kind: str, user_id: uuid.UUID) -> None:
    if kind not in KINDS:
        raise ValueError("unknown credential kind")
    db_user = await db.control().fetchval(
        "SELECT db_user FROM db_credentials WHERE project_id=$1 AND kind=$2", project_id, kind
    )
    pw = generate_db_password()
    admin = await db.admin_connect()
    try:
        await admin.execute(f"ALTER ROLE {_q(db_user)} PASSWORD '{pw}'")
    finally:
        await admin.close()
    await db.control().execute(
        "UPDATE db_credentials SET secret_enc=$3, rotated_at=now() WHERE project_id=$1 AND kind=$2",
        project_id,
        kind,
        encrypt_secret(pw),
    )
    await db.control().execute(
        "INSERT INTO audit_log (project_id, user_id, actor, action, ok, sql_text) VALUES ($1,$2,'user','rotate',true,$3)",
        project_id,
        user_id,
        f"rotated password of {db_user}",
    )
    await db.drop_tenant_pools(project_id)


async def delete_project(project_id: uuid.UUID) -> None:
    row = await db.control().fetchrow("SELECT db_name, role_prefix FROM projects WHERE project_id=$1", project_id)
    if not row:
        return
    await db.drop_tenant_pools(project_id)
    biz = await db.control().fetch("SELECT db_role FROM business_roles WHERE project_id=$1", project_id)
    admin = await db.admin_connect()
    try:
        await admin.execute(f"DROP DATABASE IF EXISTS {_q(row['db_name'])} WITH (FORCE)")
        for r in [b["db_role"] for b in biz] + [f"{row['role_prefix']}_{k}" for k in KINDS]:
            try:
                await admin.execute(f"DROP ROLE IF EXISTS {_q(r)}")
            except asyncpg.PostgresError:
                pass
    finally:
        await admin.close()
    await db.control().execute("UPDATE projects SET status='deleted' WHERE project_id=$1", project_id)
