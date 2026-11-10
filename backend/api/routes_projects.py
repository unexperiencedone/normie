from __future__ import annotations

import re
import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.deps import User, current_user, project_for
from backend.config import get_settings
from backend.core import db
from backend.core.security import decrypt_secret
from backend.services import executor
from backend.services.executor import Actor, jsonable
from backend.tenancy import provision

router = APIRouter(prefix="/projects", tags=["projects"])
NAME = re.compile(r"^[\w][\w \-\.]{0,59}$")


class NewProject(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str = Field("", max_length=2000)


class ProjectPatch(BaseModel):
    auto_approve_low_risk: bool | None = None
    description: str | None = Field(None, max_length=2000)


class DeleteReq(BaseModel):
    confirm_name: str


class CredReq(BaseModel):
    kind: str


@router.get("")
async def list_projects(user: User = Depends(current_user)):
    rows = await db.control().fetch(
        """SELECT p.project_id, p.name, p.description, p.status, p.schema_version, p.created_at,
                  (SELECT count(*) FROM approvals a WHERE a.project_id=p.project_id AND a.status='pending') AS pending
           FROM projects p WHERE owner_id=$1 AND status <> 'deleted' ORDER BY created_at DESC""", user.id)
    out = []
    for r in rows:
        d = jsonable(dict(r))
        if r["status"] == "ready":
            try:
                sch = await executor.schema(r["project_id"])
                d["tables"] = len([t for t in sch["tables"] if t["kind"] == "table"])
                d["size_bytes"] = sum(t["size_bytes"] for t in sch["tables"])
            except Exception:
                d["tables"] = None
        out.append(d)
    return out


@router.post("")
async def create_project(body: NewProject, user: User = Depends(current_user)):
    name = body.name.strip()
    if not NAME.match(name):
        raise HTTPException(400, "name may contain letters, digits, spaces, - _ .")
    try:
        pid = await provision.provision_project(user.id, name, body.description.strip())
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "you already have a project with this name") from None
    return {"project_id": str(pid)}


@router.get("/{project_id}")
async def get_project(project: dict = Depends(project_for)):
    pending = await db.control().fetchval(
        "SELECT count(*) FROM approvals WHERE project_id=$1 AND status='pending'", project["project_id"])
    return {**jsonable(project), "pending_approvals": pending}


@router.patch("/{project_id}")
async def patch_project(body: ProjectPatch, project: dict = Depends(project_for)):
    if body.auto_approve_low_risk is not None:
        await db.control().execute("UPDATE projects SET auto_approve_low_risk=$2 WHERE project_id=$1",
                                   project["project_id"], body.auto_approve_low_risk)
    if body.description is not None:
        await db.control().execute("UPDATE projects SET description=$2 WHERE project_id=$1",
                                   project["project_id"], body.description)
    return {"ok": True}


@router.delete("/{project_id}")
async def delete_project(body: DeleteReq, project: dict = Depends(project_for)):
    if body.confirm_name != project["name"]:
        raise HTTPException(400, "type the project name exactly to confirm deletion")
    await provision.delete_project(project["project_id"])
    return {"ok": True}


# ----------------------------------------------------------- connection / credentials

@router.get("/{project_id}/connection")
async def connection(project: dict = Depends(project_for)):
    s = get_settings()
    creds = await db.control().fetch(
        "SELECT kind, db_user, rotated_at FROM db_credentials WHERE project_id=$1 "
        "ORDER BY array_position(ARRAY['owner','rw','ro'], kind)", project["project_id"])
    return {
        "host": s.public_db_host or s.pg_host, "port": s.public_db_port or s.pg_port, "database": project["db_name"],
        "roles": [
            {**jsonable(dict(c)), "purpose": {
                "owner": "Schema owner. Runs migrations (DDL). Keep private.",
                "rw": "Application role: SELECT/INSERT/UPDATE/DELETE, no DDL.",
                "ro": "Read-only role for BI tools and analytics. Forced READ ONLY.",
            }[c["kind"]]}
            for c in creds
        ],
    }


@router.post("/{project_id}/connection/reveal")
async def reveal(body: CredReq, project: dict = Depends(project_for), user: User = Depends(current_user)):
    row = await db.control().fetchrow(
        "SELECT db_user, secret_enc FROM db_credentials WHERE project_id=$1 AND kind=$2", project["project_id"], body.kind)
    if not row:
        raise HTTPException(404, "unknown credential")
    await executor.audit(project["project_id"], Actor(user.id, "user"), "reveal", f"revealed password of {row['db_user']}",
                         ok=True)
    return {"db_user": row["db_user"], "password": decrypt_secret(row["secret_enc"])}


@router.post("/{project_id}/connection/rotate")
async def rotate(body: CredReq, project: dict = Depends(project_for), user: User = Depends(current_user)):
    try:
        await provision.rotate_password(project["project_id"], body.kind, user.id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    return {"ok": True}
