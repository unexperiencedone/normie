"""Data-plane routes: schema, table browsing/editing, SQL editor, approvals, audit/undo, roles, backups, tuning.

Every write from the UI goes through approvals.request_sql exactly like the agent's writes.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlglot import exp

from backend.api.deps import User, current_user, project_for
from backend.core import db
from backend.services import approvals, backups, executor, normalization, security, sqlpolicy
from backend.services.executor import Actor, jsonable
from backend.tools.sql.algebra import to_relational_algebra

router = APIRouter(prefix="/projects/{project_id}", tags=["data"])
tools_router = APIRouter(prefix="/tools", tags=["tools"])


def _q(i: str) -> str:
    return '"' + i.replace('"', '""') + '"'


def _lit(v: Any) -> str:
    if isinstance(v, (dict, list)):
        v = json.dumps(v)
    return exp.convert(v).sql(dialect="postgres")


async def _table(project_id: uuid.UUID, name: str) -> dict:
    sch = await executor.schema(project_id)
    t = next((t for t in sch["tables"] if t["name"] == name), None)
    if not t:
        raise HTTPException(404, f"table {name} not found")
    return t


# ----------------------------------------------------------------- schema & rows

@router.get("/schema")
async def get_schema(project: dict = Depends(project_for)):
    return await executor.schema(project["project_id"])


@router.get("/tables/{table}/rows")
async def table_rows(table: str, project: dict = Depends(project_for), user: User = Depends(current_user),
                     limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                     order: str | None = None, desc: bool = False):
    t = await _table(project["project_id"], table)
    cols = [c["name"] for c in t["columns"]]
    order_col = order if order in cols else (t["primary_key"][0] if t["primary_key"] else None)
    sql = f"SELECT * FROM {_q(table)}"
    if order_col:
        sql += f" ORDER BY {_q(order_col)} {'DESC' if desc else 'ASC'}"
    sql += f" LIMIT {limit} OFFSET {offset}"
    actor = Actor(user.id, "user")
    res = await executor.run_read(project["project_id"], sql, actor, limit=limit)
    if t["row_estimate"] < 200_000:
        total = (await executor.run_read(project["project_id"], f"SELECT count(*) FROM {_q(table)}", actor))["rows"][0][0]
        exact = True
    else:
        total, exact = t["row_estimate"], False
    return {**res, "total": total, "total_exact": exact, "table": t, "sql": sql}


class RowInsert(BaseModel):
    values: dict[str, Any]


class RowUpdate(BaseModel):
    pk: dict[str, Any]
    values: dict[str, Any]


class RowDelete(BaseModel):
    pk: dict[str, Any]


def _check_cols(t: dict, names) -> None:
    cols = {c["name"] for c in t["columns"]}
    bad = [n for n in names if n not in cols]
    if bad:
        raise HTTPException(400, f"unknown columns {bad}")


def _where_pk(t: dict, pk: dict) -> str:
    if not t["primary_key"] or set(pk) != set(t["primary_key"]):
        raise HTTPException(400, "row edits need the full primary key")
    return " AND ".join(f"{_q(k)} = {_lit(v)}" for k, v in pk.items())


@router.post("/tables/{table}/insert")
async def row_insert(table: str, body: RowInsert, project: dict = Depends(project_for), user: User = Depends(current_user)):
    t = await _table(project["project_id"], table)
    vals = {k: v for k, v in body.values.items() if v != ""}
    _check_cols(t, vals)
    if vals:
        sql = f"INSERT INTO {_q(table)} ({', '.join(map(_q, vals))}) VALUES ({', '.join(_lit(v) for v in vals.values())})"
    else:
        sql = f"INSERT INTO {_q(table)} DEFAULT VALUES"
    return await approvals.request_sql(project["project_id"], sql, f"insert row into {table}", Actor(user.id, "user"))


@router.post("/tables/{table}/update")
async def row_update(table: str, body: RowUpdate, project: dict = Depends(project_for), user: User = Depends(current_user)):
    t = await _table(project["project_id"], table)
    _check_cols(t, list(body.values) + list(body.pk))
    if not body.values:
        raise HTTPException(400, "nothing to update")
    sets = ", ".join(f"{_q(k)} = {_lit(v)}" for k, v in body.values.items())
    sql = f"UPDATE {_q(table)} SET {sets} WHERE {_where_pk(t, body.pk)}"
    return await approvals.request_sql(project["project_id"], sql, f"edit row in {table}", Actor(user.id, "user"))


@router.post("/tables/{table}/delete")
async def row_delete(table: str, body: RowDelete, project: dict = Depends(project_for), user: User = Depends(current_user)):
    t = await _table(project["project_id"], table)
    _check_cols(t, body.pk)
    sql = f"DELETE FROM {_q(table)} WHERE {_where_pk(t, body.pk)}"
    return await approvals.request_sql(project["project_id"], sql, f"delete row from {table}", Actor(user.id, "user"))


# ----------------------------------------------------------------- SQL editor

class SqlReq(BaseModel):
    sql: str = Field(max_length=200_000)
    analyze: bool = False
    summary: str | None = None


@router.post("/sql/run")
async def sql_run(body: SqlReq, project: dict = Depends(project_for), user: User = Depends(current_user)):
    stmts = sqlpolicy.parse(body.sql)
    actor = Actor(user.id, "user")
    if all(s.kind == "read" for s in stmts):
        if len(stmts) > 1:
            raise HTTPException(400, "run one SELECT at a time (select the statement to run)")
        res = await executor.run_read(project["project_id"], body.sql, actor)
        return {"kind": "rows", **res, "algebra": to_relational_algebra(body.sql).unicode_str}
    r = await approvals.request_sql(project["project_id"], body.sql, body.summary or "SQL editor change", actor)
    return {"kind": "executed" if r["status"] == "executed" else "approval", **r}


@router.post("/sql/explain")
async def sql_explain(body: SqlReq, project: dict = Depends(project_for)):
    return await executor.explain(project["project_id"], body.sql, analyze=body.analyze)


@router.post("/sql/algebra")
async def sql_algebra(body: SqlReq, project: dict = Depends(project_for)):
    r = to_relational_algebra(body.sql)
    return {"unicode": r.unicode_str, "latex": r.latex_str, "operators": r.operators}


# ----------------------------------------------------------------- approvals

class Decision(BaseModel):
    approve: bool


@router.get("/approvals")
async def list_approvals(project: dict = Depends(project_for), status: str | None = None, limit: int = 50):
    if status:
        rows = await db.control().fetch(
            "SELECT * FROM approvals WHERE project_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT $3",
            project["project_id"], status, limit)
    else:
        rows = await db.control().fetch(
            "SELECT * FROM approvals WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2", project["project_id"], limit)
    return [jsonable(dict(r)) for r in rows]


@router.post("/approvals/{approval_id}/decision")
async def decide(approval_id: uuid.UUID, body: Decision, project: dict = Depends(project_for),
                 user: User = Depends(current_user)):
    return await approvals.decide(project["project_id"], approval_id, user.id, body.approve)


# ----------------------------------------------------------------- audit / undo / migrations

@router.get("/audit")
async def audit(project: dict = Depends(project_for), limit: int = Query(100, le=500),
                include_queries: bool = False):
    rows = await db.control().fetch(
        f"""SELECT a.audit_id, a.actor, a.action, a.sql_text, a.ok, a.error, a.rows_affected, a.duration_ms,
                   a.undo IS NOT NULL AS reversible, a.undone_by, a.created_at, u.email
            FROM audit_log a LEFT JOIN users u USING (user_id)
            WHERE a.project_id=$1 {'' if include_queries else "AND a.action <> 'query'"}
            ORDER BY a.audit_id DESC LIMIT $2""", project["project_id"], limit)
    return [jsonable(dict(r)) for r in rows]


@router.post("/audit/{audit_id}/undo")
async def undo(audit_id: int, project: dict = Depends(project_for), user: User = Depends(current_user)):
    return await approvals.request_undo(project["project_id"], audit_id, Actor(user.id, "user"))


@router.get("/migrations")
async def migrations(project: dict = Depends(project_for)):
    rows = await db.control().fetch(
        """SELECT v.version, v.summary, v.up_sql, v.down_sql, v.applied_at, u.email
           FROM schema_versions v LEFT JOIN users u ON u.user_id = v.applied_by
           WHERE project_id=$1 ORDER BY version DESC""", project["project_id"])
    return [jsonable(dict(r)) for r in rows]


# ----------------------------------------------------------------- roles

class SimReq(BaseModel):
    sql: str


@router.get("/roles")
async def roles(project: dict = Depends(project_for)):
    rows = await db.control().fetch(
        "SELECT name, db_role, description, policy, created_at FROM business_roles WHERE project_id=$1 ORDER BY name",
        project["project_id"])
    return [jsonable(dict(r)) for r in rows]


@router.post("/roles")
async def create_role(spec: security.RoleSpec, project: dict = Depends(project_for), user: User = Depends(current_user)):
    return await approvals.request_role(project["project_id"], spec, Actor(user.id, "user"))


@router.post("/roles/{name}/simulate")
async def simulate(name: str, body: SimReq, project: dict = Depends(project_for)):
    try:
        db_role = await security.get_db_role(project["project_id"], name)
    except LookupError as e:
        raise HTTPException(404, str(e)) from None
    return await executor.simulate_access(project["project_id"], db_role, body.sql)


# ----------------------------------------------------------------- backups

class BackupReq(BaseModel):
    label: str = Field("manual backup", max_length=100)


@router.get("/backups")
async def list_backups(project: dict = Depends(project_for)):
    rows = await db.control().fetch(
        """SELECT backup_id, label, size_bytes, schema_version, created_at FROM backups
           WHERE project_id=$1 ORDER BY created_at DESC""", project["project_id"])
    return [jsonable(dict(r)) for r in rows]


@router.post("/backups")
async def make_backup(body: BackupReq, project: dict = Depends(project_for), user: User = Depends(current_user)):
    return await backups.create_backup(project["project_id"], body.label, user.id)


@router.post("/backups/{backup_id}/restore")
async def restore(backup_id: uuid.UUID, project: dict = Depends(project_for), user: User = Depends(current_user)):
    return await approvals.request_restore(project["project_id"], backup_id, Actor(user.id, "user"))


# ----------------------------------------------------------------- tuning

class BenchReq(BaseModel):
    sql: str
    index_ddl: str


@router.get("/slow-queries")
async def slow(project: dict = Depends(project_for)):
    return await executor.slow_queries(project["project_id"])


@router.post("/benchmark-index")
async def bench(body: BenchReq, project: dict = Depends(project_for)):
    return await executor.benchmark_index(project["project_id"], body.sql, body.index_ddl)


# ----------------------------------------------------------------- deterministic theory tools

class FDItem(BaseModel):
    lhs: list[str]
    rhs: list[str]


class NormReq(BaseModel):
    attributes: list[str]
    fds: list[FDItem]


@tools_router.post("/normalize")
async def normalize(body: NormReq, _: User = Depends(current_user)):
    try:
        return normalization.analyze([a.strip() for a in body.attributes], [f.model_dump() for f in body.fds])
    except ValueError as e:
        raise HTTPException(400, str(e)) from None


# ----------------------------------------------------------------- normalisation of the project's real tables

class DecomposeReq(BaseModel):
    fds: list[FDItem]
    target: str = Field("bcnf", pattern="^(3nf|bcnf)$")


@router.get("/normalization")
async def norm_health(project: dict = Depends(project_for)):
    return await normalization.schema_health(project["project_id"])


@router.get("/normalization/{table}")
async def norm_table(table: str, project: dict = Depends(project_for), discover: bool = True):
    t = await normalization.table_info(project["project_id"], table)
    observed = await normalization.discover_fds(project["project_id"], t) if discover else {"rows": None, "fds": []}
    return {
        "table": table,
        "attributes": [c["name"] for c in t["columns"]],
        "declared": normalization.declared_fds(t),
        "observed": observed["fds"],
        "rows": observed["rows"],
        "note": observed.get("note"),
    }


@router.post("/normalization/{table}/decompose")
async def norm_decompose(table: str, body: DecomposeReq, project: dict = Depends(project_for),
                         user: User = Depends(current_user)):
    t = await normalization.table_info(project["project_id"], table)
    fds = [f.model_dump() for f in body.fds]
    res = normalization.analyze([c["name"] for c in t["columns"]], fds)
    parts = res[body.target]["relations"]
    if len(parts) <= 1:
        raise HTTPException(400, f"{table} is already in {body.target.upper()} for these dependencies: nothing to decompose")
    up, down, plan = normalization.decomposition_sql(table, fds, parts)
    r = await approvals.request_sql(project["project_id"], up, f"decompose {table} into {body.target.upper()} ({len(parts)} tables)",
                                    Actor(user.id, "user"), down_sql=down)
    return {**r, "plan": plan, "lossless": res[body.target]["lossless"],
            "dependency_preserving": res[body.target]["dependency_preserving"]}
