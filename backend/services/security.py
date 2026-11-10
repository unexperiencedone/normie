"""Business roles (Security agent): 'receptionist can see appointments but not diagnoses'.

A business role becomes a real PostgreSQL NOLOGIN role:
  * column-level GRANTs on tables,
  * a per-role VIEW with only the visible columns (the 'external schema' of the 3-schema architecture),
  * optional row-level-security policy (row filter),
  * granted to the project's ro/rw login roles WITH INHERIT FALSE, SET TRUE, so DBForge can execute
    queries `SET LOCAL ROLE <business role>` and PostgreSQL itself enforces the policy.
"""
from __future__ import annotations

import re
import uuid
from typing import Literal

import sqlglot
from pydantic import BaseModel, Field, field_validator
from sqlglot import exp

from backend.core import db
from backend.services import executor
from backend.services.sqlpolicy import DENIED_FUNCTIONS, PolicyError

IDENT = re.compile(r"^[a-z][a-z0-9_]{0,40}$")


class TableGrant(BaseModel):
    table: str
    privileges: list[Literal["SELECT", "INSERT", "UPDATE", "DELETE"]] = Field(default_factory=lambda: ["SELECT"])
    columns: list[str] | None = Field(None, description="visible columns; null = all columns")
    row_filter: str | None = Field(None, description="SQL boolean expression on this table's columns, e.g. doctor_id = 3")


class RoleSpec(BaseModel):
    name: str = Field(description="lowercase identifier, e.g. receptionist")
    description: str = ""
    grants: list[TableGrant]

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip().lower().replace(" ", "_")
        if not IDENT.match(v):
            raise ValueError("role name must be a lowercase identifier")
        return v


def _q(i: str) -> str:
    return '"' + i.replace('"', '""') + '"'


def _check_filter(expr: str, columns: set[str]) -> str:
    try:
        node = sqlglot.parse_one(expr, read="postgres", into=exp.Condition)
    except Exception as e:
        raise PolicyError(f"invalid row filter: {e}") from None
    for fn in node.find_all(exp.Func):
        name = (fn.name if isinstance(fn, exp.Anonymous) else fn.sql_name()).lower()
        if name in DENIED_FUNCTIONS:
            raise PolicyError(f"function {name} not allowed in row filter")
    if node.find(exp.Select):
        raise PolicyError("subqueries are not allowed in row filters")
    for col in node.find_all(exp.Column):
        if col.name not in columns:
            raise PolicyError(f"row filter references unknown column '{col.name}'")
    return node.sql(dialect="postgres")


async def build_role_sql(project_id: uuid.UUID, spec: RoleSpec) -> dict:
    prefix = await db.control().fetchval("SELECT role_prefix FROM projects WHERE project_id=$1", project_id)
    db_role = f"{prefix}_r_{spec.name}"
    schema = await executor.schema(project_id)
    tables = {t["name"]: t for t in schema["tables"]}
    rw, ro = f"{prefix}_rw", f"{prefix}_ro"
    br = _q(db_role)
    lines = [
        f"-- business role '{spec.name}': {spec.description}",
        f"GRANT USAGE ON SCHEMA public TO {br};",
        f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {br};",
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {br};",
    ]
    views = []
    for g in spec.grants:
        t = tables.get(g.table)
        if not t:
            raise PolicyError(f"unknown table '{g.table}'")
        all_cols = [c["name"] for c in t["columns"]]
        cols = g.columns or all_cols
        bad = [c for c in cols if c not in all_cols]
        if bad:
            raise PolicyError(f"unknown columns on {g.table}: {bad}")
        tq = _q(g.table)
        col_list = ", ".join(_q(c) for c in cols)
        for p in g.privileges:
            if p in ("SELECT", "UPDATE", "INSERT") and g.columns:
                lines.append(f"GRANT {p} ({col_list}) ON {tq} TO {br};")
            else:
                lines.append(f"GRANT {p} ON {tq} TO {br};")
        if g.columns and "SELECT" in g.privileges and t["kind"] == "table":
            vname = f"{g.table}_for_{spec.name}"
            views.append(vname)
            lines.append(
                f"CREATE OR REPLACE VIEW {_q(vname)} WITH (security_invoker = true) AS SELECT {col_list} FROM {tq};"
            )
            lines.append(f"GRANT SELECT ON {_q(vname)} TO {br};")
        if g.row_filter:
            f = _check_filter(g.row_filter, set(all_cols))
            # "dbforge_" prefix kept on purpose: policies with this name already exist in deployed
            # tenant databases, and DROP POLICY IF EXISTS below must keep matching them.
            pol = f"dbforge_{spec.name}"
            lines += [
                f"ALTER TABLE {tq} ENABLE ROW LEVEL SECURITY;",
                # base login roles keep full visibility; only the business role is filtered
                f"DROP POLICY IF EXISTS dbforge_base ON {tq};",
                f"CREATE POLICY dbforge_base ON {tq} FOR ALL TO {_q(rw)}, {_q(ro)} USING (true) WITH CHECK (true);",
                f"DROP POLICY IF EXISTS {_q(pol)} ON {tq};",
                f"CREATE POLICY {_q(pol)} ON {tq} FOR ALL TO {br} USING ({f}) WITH CHECK ({f});",
            ]
    return {"db_role": db_role, "sql": "\n".join(lines), "views": views}


async def ensure_db_role(project_id: uuid.UUID, db_role: str) -> None:
    prefix = await db.control().fetchval("SELECT role_prefix FROM projects WHERE project_id=$1", project_id)
    assert db_role.startswith(prefix + "_r_") and IDENT.match(db_role.replace(prefix + "_r_", "")), db_role
    admin = await db.admin_connect()
    try:
        exists = await admin.fetchval("SELECT 1 FROM pg_roles WHERE rolname=$1", db_role)
        if not exists:
            await admin.execute(f"CREATE ROLE {_q(db_role)} NOLOGIN NOINHERIT")
        for login in (f"{prefix}_rw", f"{prefix}_ro"):
            await admin.execute(f"GRANT {_q(db_role)} TO {_q(login)} WITH INHERIT FALSE, SET TRUE")
    finally:
        await admin.close()


async def apply_role(project_id: uuid.UUID, spec: RoleSpec, actor: executor.Actor) -> dict:
    built = await build_role_sql(project_id, spec)
    await ensure_db_role(project_id, built["db_role"])
    res = await executor.apply_migration(project_id, built["sql"], f"security: role {spec.name}", actor,
                                         allow_grants=True)
    await db.control().execute(
        """INSERT INTO business_roles (project_id, name, db_role, description, policy)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (project_id, name) DO UPDATE SET description=EXCLUDED.description, policy=EXCLUDED.policy""",
        project_id, spec.name, built["db_role"], spec.description, spec.model_dump())
    return {**res, "db_role": built["db_role"], "views": built["views"]}


async def get_db_role(project_id: uuid.UUID, name: str) -> str:
    r = await db.control().fetchval("SELECT db_role FROM business_roles WHERE project_id=$1 AND name=$2", project_id, name)
    if not r:
        raise LookupError(f"unknown business role '{name}'")
    return r
