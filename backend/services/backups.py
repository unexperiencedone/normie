"""Logical backups per project (pg_dump custom format) and restore (pg_restore --clean).

Recovery-agent territory. A backup is taken automatically before every HIGH-risk migration.
The admin password is passed via the PGPASSWORD environment of the child process, never argv.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import uuid
from pathlib import Path

from backend.config import ROOT, get_settings
from backend.core import db
from backend.services import executor

BACKUP_DIR = ROOT / "var" / "backups"


def _bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for d in sorted(Path("/usr/lib/postgresql").glob("*/bin"), reverse=True):
        if (d / name).exists():
            return str(d / name)
    raise RuntimeError(f"{name} not found")


async def _run(*args: str) -> None:
    s = get_settings()
    env = {**os.environ, "PGPASSWORD": s.pg_admin_password}
    proc = await asyncio.create_subprocess_exec(
        *args, "-h", s.pg_host, "-p", str(s.pg_port), "-U", s.pg_admin_user,
        env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(err.decode()[-800:])


async def create_backup(project_id: uuid.UUID, label: str, user_id: uuid.UUID | None) -> dict:
    p = await db.control().fetchrow("SELECT db_name, schema_version FROM projects WHERE project_id=$1", project_id)
    folder = BACKUP_DIR / str(project_id)
    folder.mkdir(parents=True, exist_ok=True)
    bid = uuid.uuid4()
    path = folder / f"{bid}.dump"
    await _run(_bin("pg_dump"), "-Fc", "-f", str(path), "-d", p["db_name"])
    os.chmod(path, 0o600)
    size = path.stat().st_size
    await db.control().execute(
        """INSERT INTO backups (backup_id, project_id, label, path, size_bytes, schema_version, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)""", bid, project_id, label, str(path), size, p["schema_version"], user_id)
    await executor.audit(project_id, executor.Actor(user_id, "system" if user_id is None else "user"), "backup",
                         f"pg_dump -> {path.name} ({label})", ok=True)
    return {"backup_id": str(bid), "label": label, "size_bytes": size}


async def restore_backup(project_id: uuid.UUID, backup_id: uuid.UUID, actor: executor.Actor) -> dict:
    row = await db.control().fetchrow(
        """SELECT b.path, p.db_name FROM backups b JOIN projects p USING (project_id)
           WHERE b.project_id=$1 AND b.backup_id=$2""", project_id, backup_id)
    if not row:
        raise LookupError("backup not found")
    await db.drop_tenant_pools(project_id)
    await _run(_bin("pg_restore"), "--clean", "--if-exists", "--single-transaction", "-d", row["db_name"], row["path"])
    await executor.audit(project_id, actor, "restore", f"pg_restore {Path(row['path']).name}", ok=True)
    return {"restored": str(backup_id)}
