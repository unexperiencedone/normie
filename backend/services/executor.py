"""Executes SQL against a tenant database with the right least-privilege role.

    reads      -> `_ro` pool, READ ONLY transaction, row cap via cursor
    explain    -> reads on `_ro`; writes on `_rw` inside a transaction that is always rolled back
    dry runs   -> `_rw` (DML) / `_owner` (DDL) inside a transaction that is always rolled back.
                  PostgreSQL DDL is transactional, so a migration dry run is a *real* execution.
    commits    -> only after policy + approval (see approvals.py); before-images captured for undo
"""
from __future__ import annotations

import datetime as dt
import decimal
import ipaddress
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

import asyncpg

from backend.config import get_settings
from backend.core import db
from backend.services import sqlpolicy
from backend.services.introspect import introspect
from backend.services.sqlpolicy import PolicyError, Statement


class ExecError(Exception):
    def __init__(self, message: str, *, detail: str | None = None, hint: str | None = None,
                 sqlstate: str | None = None, position: int | None = None):
        super().__init__(message)
        self.payload = {"message": message, "detail": detail, "hint": hint, "sqlstate": sqlstate, "position": position}


def pg_error(e: Exception) -> ExecError:
    if isinstance(e, ExecError):
        return e
    if isinstance(e, asyncpg.PostgresError):
        pos = getattr(e, "position", None)
        return ExecError(
            getattr(e, "message", None) or str(e),
            detail=getattr(e, "detail", None),
            hint=getattr(e, "hint", None),
            sqlstate=getattr(e, "sqlstate", None),
            position=int(pos) if pos else None,
        )
    if isinstance(e, PolicyError):
        return ExecError(f"Blocked by policy: {e}", sqlstate="POLICY")
    return ExecError(str(e))


def jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, decimal.Decimal):
        # keep exact decimal text (money!) unless it is a safe integer
        return int(v) if v == v.to_integral_value() and abs(v) < 2**53 else str(v)
    if isinstance(v, (dt.datetime, dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, dt.timedelta):
        return str(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return "\\x" + bytes(v).hex()
    if isinstance(v, (ipaddress.IPv4Address, ipaddress.IPv6Address, ipaddress.IPv4Network, ipaddress.IPv6Network)):
        return str(v)
    if isinstance(v, dict):
        return {k: jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [jsonable(x) for x in v]
    if isinstance(v, asyncpg.Record):
        return {k: jsonable(x) for k, x in v.items()}
    return str(v)


def _q(ident: str) -> str:
    return '"' + ident.replace('"', '""') + '"'


@dataclass
class Actor:
    user_id: uuid.UUID | None
    kind: str  # user | agent | system


async def audit(project_id: uuid.UUID, actor: Actor, action: str, sql: str | None, *, ok: bool,
                error: str | None = None, rows: int | None = None, duration_ms: int | None = None,
                undo: dict | None = None) -> int:
    return await db.control().fetchval(
        """INSERT INTO audit_log (project_id, user_id, actor, action, sql_text, ok, error, rows_affected, duration_ms, undo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING audit_id""",
        project_id, actor.user_id, actor.kind, action, sql, ok, error, rows, duration_ms, undo,
    )


# ------------------------------------------------------------------ sequence-neutral dry runs
# Sequences (serial / identity) are NOT transactional: a rolled-back INSERT still consumes ids.
# Without this, a dry run of "INSERT 5 doctors" makes the real run produce ids 6..10, and any
# script that references doctor_id = 1..5 then fails with a foreign-key violation.

SEQ_SQL = """SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'S' AND n.nspname = 'public'"""


async def snapshot_sequences(conn: asyncpg.Connection) -> dict[str, tuple[int, bool]]:
    out = {}
    for r in await conn.fetch(SEQ_SQL):
        row = await conn.fetchrow(f"SELECT last_value, is_called FROM {_q(r['relname'])}")
        out[r["relname"]] = (row["last_value"], row["is_called"])
    return out


async def restore_sequences(project_id: uuid.UUID, before: dict[str, tuple[int, bool]]) -> None:
    """After a rolled-back dry run, rewind every sequence it advanced. Compare-and-set: a sequence
    is only rewound if nobody advanced it since we read it, so concurrent real inserts are safe."""
    if not before:
        return
    pool = await db.tenant_pool(project_id, "owner")  # setval needs UPDATE on the sequence
    async with pool.acquire() as conn:
        after = await snapshot_sequences(conn)
        for name, (val, called) in before.items():
            if name in after and after[name] != (val, called):
                await conn.execute(
                    f"SELECT setval($1::regclass, $2, $3) WHERE (SELECT last_value FROM {_q(name)}) = $4",
                    _q(name), val, called, after[name][0],
                )


# ------------------------------------------------------------------ reads

async def run_read(project_id: uuid.UUID, sql: str, actor: Actor, *, business_role: str | None = None,
                   limit: int | None = None) -> dict[str, Any]:
    s = get_settings()
    limit = min(limit or s.row_limit, s.row_limit)
    st = sqlpolicy.single(sql)
    if st.kind != "read":
        raise ExecError(f"{st.op} is not a read-only statement", sqlstate="POLICY")
    pool = await db.tenant_pool(project_id, "ro")
    t0 = time.perf_counter()
    try:
        async with pool.acquire() as conn:
            async with conn.transaction(readonly=True):
                if business_role:
                    await conn.execute(f"SET LOCAL ROLE {_q(business_role)}")
                stmt = await conn.prepare(st.sql)
                cols = [{"name": a.name, "type": a.type.name} for a in stmt.get_attributes()]
                cur = await stmt.cursor()
                rows = await cur.fetch(limit + 1)
    except Exception as e:
        err = pg_error(e)
        await audit(project_id, actor, "query", sql, ok=False, error=str(err),
                    duration_ms=int((time.perf_counter() - t0) * 1000))
        raise err from None
    ms = (time.perf_counter() - t0) * 1000
    truncated = len(rows) > limit
    rows = rows[:limit]
    await audit(project_id, actor, "query", sql, ok=True, rows=len(rows), duration_ms=int(ms))
    return {
        "columns": cols,
        "rows": [[jsonable(v) for v in r.values()] for r in rows],
        "row_count": len(rows),
        "truncated": truncated,
        "duration_ms": round(ms, 2),
    }


async def explain(project_id: uuid.UUID, sql: str, *, analyze: bool = False) -> dict[str, Any]:
    st = sqlpolicy.single(sql)
    if st.kind == "ddl":
        raise ExecError("EXPLAIN only works for SELECT/INSERT/UPDATE/DELETE", sqlstate="POLICY")
    opts = "FORMAT JSON, VERBOSE" + (", ANALYZE, BUFFERS, TIMING" if analyze else "")
    kind = "ro" if st.kind == "read" else "rw"
    pool = await db.tenant_pool(project_id, kind)
    seqs: dict = {}
    try:
        async with pool.acquire() as conn:
            if analyze and kind == "rw":
                seqs = await snapshot_sequences(conn)
            tr = conn.transaction(readonly=(kind == "ro"))
            await tr.start()
            try:
                plan = await conn.fetchval(f"EXPLAIN ({opts}) {st.sql}")
            finally:
                await tr.rollback()  # ANALYZE of a write really executes it: always undo
    except Exception as e:
        raise pg_error(e) from None
    finally:
        await restore_sequences(project_id, seqs)
    if isinstance(plan, str):
        plan = json.loads(plan)
    root = plan[0]
    return {"plan": root, "text": plan_to_text(root["Plan"]), "analyzed": analyze,
            "total_cost": root["Plan"].get("Total Cost"),
            "execution_ms": root.get("Execution Time"), "planning_ms": root.get("Planning Time")}


def plan_to_text(node: dict, depth: int = 0) -> str:
    label = node.get("Node Type", "?")
    if node.get("Relation Name"):
        label += f" on {node['Relation Name']}"
    if node.get("Index Name"):
        label += f" using {node['Index Name']}"
    stats = f"(cost={node.get('Startup Cost')}..{node.get('Total Cost')} rows={node.get('Plan Rows')})"
    if "Actual Total Time" in node:
        stats += f" (actual time={node['Actual Total Time']}ms rows={node.get('Actual Rows')} loops={node.get('Actual Loops')})"
    lines = [("  " * depth) + ("-> " if depth else "") + f"{label} {stats}"]
    for key in ("Filter", "Index Cond", "Hash Cond", "Join Filter", "Merge Cond", "Recheck Cond"):
        if node.get(key):
            lines.append("  " * (depth + 1) + f"   {key}: {node[key]}")
    for child in node.get("Plans", []):
        lines.append(plan_to_text(child, depth + 1))
    return "\n".join(lines)


# ------------------------------------------------------------------ writes (DML)

async def _pk_columns(conn: asyncpg.Connection, table: str) -> list[str]:
    return [r["attname"] for r in await conn.fetch(
        """SELECT a.attname FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
           WHERE i.indrelid = to_regclass(quote_ident($1)) AND i.indisprimary""", table)]


def _capture_plan(st: Statement) -> dict[str, Any] | None:
    """Work out how to capture before/after images for undo. None => not reversible."""
    from sqlglot import exp

    ast = st.ast
    if ast is None or ast.args.get("returning") is not None:
        return None
    tbl = ast.find(exp.Table)
    if tbl is None:
        return None
    ref = tbl.alias_or_name
    body = st.sql.rstrip().rstrip(";")
    if isinstance(ast, exp.Insert):
        return {"op": "insert", "table": tbl.name, "sql": f"{body} RETURNING to_jsonb({_q(ref)})"}
    if isinstance(ast, exp.Delete):
        if ast.args.get("using"):
            return None
        return {"op": "delete", "table": tbl.name, "sql": f"{body} RETURNING to_jsonb({_q(ref)})"}
    if isinstance(ast, exp.Update):
        if ast.args.get("from") or ast.args.get("from_"):
            return None
        where = ast.args.get("where")
        before = f"SELECT to_jsonb({_q(ref)}) FROM {ast.this.sql(dialect='postgres')}"
        if where is not None:
            before += f" WHERE {where.this.sql(dialect='postgres')}"
        return {"op": "update", "table": tbl.name, "before_sql": before + " FOR UPDATE",
                "sql": f"{body} RETURNING to_jsonb({_q(ref)})"}
    return None


# Tables a DELETE on $1 reaches through foreign keys (followed recursively through CASCADE links).
CASCADE_SQL = """
WITH RECURSIVE dep(relid, action, depth) AS (
  SELECT conrelid, confdeltype::text, 1 FROM pg_constraint
   WHERE contype = 'f' AND confrelid = to_regclass(quote_ident($1))
  UNION
  SELECT c.conrelid, c.confdeltype::text, d.depth + 1 FROM pg_constraint c JOIN dep d ON c.confrelid = d.relid
   WHERE c.contype = 'f' AND d.action = 'c' AND d.depth < 8
)
SELECT DISTINCT relid::regclass::text AS tbl, action FROM dep
 WHERE relid <> to_regclass(quote_ident($1)) AND action IN ('c', 'n', 'd')
"""


async def _execute_dml(conn: asyncpg.Connection, st: Statement) -> dict[str, Any]:
    cap = _capture_plan(st)
    before: list[dict] = []
    after: list[dict] = []
    # ON DELETE CASCADE / SET NULL silently change OTHER tables: measure that inside the same
    # transaction so the preview is honest and undo is not offered when it would be partial.
    deps = await conn.fetch(CASCADE_SQL, st.target_table) if st.op == "DELETE" and st.target_table else []
    cascade_before = {d["tbl"]: await conn.fetchval(f"SELECT count(*) FROM {d['tbl']}") for d in deps if d["action"] == "c"}
    if cap:
        if cap["op"] == "update":
            before = [json.loads(r[0]) if isinstance(r[0], str) else r[0] for r in await conn.fetch(cap["before_sql"])]
        rows = await conn.fetch(cap["sql"])
        after = [json.loads(r[0]) if isinstance(r[0], str) else r[0] for r in rows]
        count = len(rows)
        if cap["op"] == "delete":
            before, after = after, []
    else:
        status = await conn.execute(st.sql)
        count = int(status.split()[-1]) if status.split()[-1].isdigit() else 0
    cascaded = {}
    for tbl, n0 in cascade_before.items():
        n1 = await conn.fetchval(f"SELECT count(*) FROM {tbl}")
        if n0 != n1:
            cascaded[tbl] = n0 - n1
    set_null = sorted(d["tbl"] for d in deps if d["action"] in ("n", "d"))
    pk = await _pk_columns(conn, cap["table"]) if cap else []
    limit = get_settings().max_dry_run_before_image
    undo = None
    if cap and pk and count <= limit and not cascaded and not set_null:
        undo = {"op": cap["op"], "table": cap["table"], "pk": pk,
                "rows": before if cap["op"] in ("update", "delete") else after}
    notes = [f"ON DELETE CASCADE also deletes {n} row(s) from {t}" for t, n in cascaded.items()]
    notes += [f"may SET NULL/DEFAULT foreign keys in {t}" for t in set_null]
    return {"rows_affected": count, "before": before[:50], "after": after[:50], "undo": undo,
            "reversible": undo is not None, "table": cap["table"] if cap else st.target_table,
            "cascaded": cascaded, "cascade_notes": notes}


async def dry_run_write(project_id: uuid.UUID, sql: str) -> dict[str, Any]:
    stmts = sqlpolicy.parse(sql)
    if len(stmts) != 1 or stmts[0].kind != "write":
        raise ExecError("expected exactly one INSERT/UPDATE/DELETE statement", sqlstate="POLICY")
    st = stmts[0]
    pool = await db.tenant_pool(project_id, "rw")
    t0 = time.perf_counter()
    seqs: dict = {}
    try:
        async with pool.acquire() as conn:
            seqs = await snapshot_sequences(conn)
            tr = conn.transaction()
            await tr.start()
            try:
                res = await _execute_dml(conn, st)
            finally:
                await tr.rollback()
    except Exception as e:
        raise pg_error(e) from None
    finally:
        await restore_sequences(project_id, seqs)
    # cascaded rows count towards risk: deleting 1 patient that wipes 40 appointments is not "low"
    total = res["rows_affected"] + sum(res["cascaded"].values())
    risk = sqlpolicy.risk_for_rows(st, total)
    if res["cascaded"] and risk == "low":
        risk = "medium"
    res.pop("undo")
    return {**res, "op": st.op, "risk": risk, "notes": st.notes + res.pop("cascade_notes"),
            "duration_ms": round((time.perf_counter() - t0) * 1000, 2)}


async def commit_write(project_id: uuid.UUID, sql: str, actor: Actor, *, max_rows: int | None = None,
                       action: str = "write") -> dict[str, Any]:
    st = sqlpolicy.single(sql)
    if st.kind != "write":
        raise ExecError("expected a DML statement", sqlstate="POLICY")
    pool = await db.tenant_pool(project_id, "rw")
    t0 = time.perf_counter()
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                res = await _execute_dml(conn, st)
                # Commit-time guard: data may have changed since the approved dry run.
                if max_rows is not None and res["rows_affected"] > max_rows:
                    raise ExecError(
                        f"statement now affects {res['rows_affected']} rows but only {max_rows} were approved; rolled back",
                        sqlstate="APPROVAL_DRIFT",
                    )
    except Exception as e:
        err = pg_error(e)
        await audit(project_id, actor, action, sql, ok=False, error=str(err),
                    duration_ms=int((time.perf_counter() - t0) * 1000))
        raise err from None
    ms = int((time.perf_counter() - t0) * 1000)
    audit_id = await audit(project_id, actor, action, sql, ok=True, rows=res["rows_affected"],
                           duration_ms=ms, undo=res["undo"])
    res.pop("undo")
    res.pop("cascade_notes", None)
    return {**res, "audit_id": audit_id, "duration_ms": ms}


# ------------------------------------------------------------------ undo

async def build_undo(project_id: uuid.UUID, audit_id: int) -> dict[str, Any]:
    row = await db.control().fetchrow(
        "SELECT undo, undone_by, ok FROM audit_log WHERE project_id=$1 AND audit_id=$2", project_id, audit_id)
    if not row or not row["ok"] or not row["undo"]:
        raise ExecError("this action is not reversible (no before-image was captured)")
    if row["undone_by"]:
        raise ExecError("this action was already undone")
    return row["undo"]


async def _undo_sql(conn: asyncpg.Connection, u: dict) -> str:
    t = _q(u["table"])
    cols = [r["attname"] for r in await conn.fetch(
        """SELECT attname FROM pg_attribute WHERE attrelid = to_regclass(quote_ident($1))
           AND attnum > 0 AND NOT attisdropped AND attgenerated = '' ORDER BY attnum""", u["table"])]
    pk = u["pk"]
    rec = f"jsonb_populate_recordset(NULL::{t}, $1::jsonb) AS r"
    pk_match = " AND ".join(f"{t}.{_q(c)} = r.{_q(c)}" for c in pk)
    if u["op"] == "insert":
        return f"DELETE FROM {t} USING {rec} WHERE {pk_match}"
    if u["op"] == "delete":
        cl = ", ".join(_q(c) for c in cols)
        return f"INSERT INTO {t} ({cl}) OVERRIDING SYSTEM VALUE SELECT {', '.join('r.' + _q(c) for c in cols)} FROM {rec}"
    sets = ", ".join(f"{_q(c)} = r.{_q(c)}" for c in cols if c not in pk)
    return f"UPDATE {t} SET {sets} FROM {rec} WHERE {pk_match}"


async def apply_undo(project_id: uuid.UUID, audit_id: int, actor: Actor, *, dry_run: bool) -> dict[str, Any]:
    u = await build_undo(project_id, audit_id)
    pool = await db.tenant_pool(project_id, "rw")
    seqs: dict = {}
    try:
        async with pool.acquire() as conn:
            if dry_run:
                seqs = await snapshot_sequences(conn)
            tr = conn.transaction()
            await tr.start()
            try:
                sql = await _undo_sql(conn, u)
                status = await conn.execute(sql, u["rows"])  # jsonb codec encodes
                n = int(status.split()[-1])
            except Exception:
                await tr.rollback()
                raise
            if dry_run:
                await tr.rollback()
                return {"sql": sql, "rows_affected": n, "op": u["op"], "table": u["table"]}
            await tr.commit()
    except Exception as e:
        raise pg_error(e) from None
    finally:
        await restore_sequences(project_id, seqs)
    new_id = await audit(project_id, actor, "undo", f"-- undo of audit #{audit_id}\n{sql}", ok=True, rows=n)
    await db.control().execute("UPDATE audit_log SET undone_by=$3 WHERE project_id=$1 AND audit_id=$2",
                               project_id, audit_id, new_id)
    return {"rows_affected": n, "audit_id": new_id, "op": u["op"], "table": u["table"]}


# ------------------------------------------------------------------ migrations (DDL)

def check_migration(sql: str, *, allow_grants: bool = False) -> list[Statement]:
    stmts = sqlpolicy.parse(sql)
    for st in stmts:
        if st.op in ("GRANT", "REVOKE") and not allow_grants:
            raise PolicyError("GRANT/REVOKE are managed by the Security agent (create a business role instead)")
        if "CONCURRENTLY" in st.sql.upper():
            raise PolicyError("CONCURRENTLY cannot run inside a migration transaction; drop the keyword")
    return stmts


def schema_diff(before: dict, after: dict) -> dict[str, Any]:
    b = {t["name"]: t for t in before["tables"]}
    a = {t["name"]: t for t in after["tables"]}
    changed = []
    for name in sorted(set(a) & set(b)):
        bc = {c["name"]: c["type"] for c in b[name]["columns"]}
        ac = {c["name"]: c["type"] for c in a[name]["columns"]}
        added = sorted(set(ac) - set(bc))
        removed = sorted(set(bc) - set(ac))
        retyped = sorted(c for c in set(ac) & set(bc) if ac[c] != bc[c])
        idx_added = sorted({i["name"] for i in a[name]["indexes"]} - {i["name"] for i in b[name]["indexes"]})
        idx_removed = sorted({i["name"] for i in b[name]["indexes"]} - {i["name"] for i in a[name]["indexes"]})
        if added or removed or retyped or idx_added or idx_removed or len(a[name]["foreign_keys"]) != len(b[name]["foreign_keys"]):
            changed.append({"table": name, "columns_added": added, "columns_removed": removed,
                            "columns_retyped": retyped, "indexes_added": idx_added, "indexes_removed": idx_removed})
    return {
        "tables_added": sorted(set(a) - set(b)),
        "tables_removed": sorted(set(b) - set(a)),
        "tables_changed": changed,
        "row_loss_risk": [n for n in set(b) - set(a) if b[n]["row_estimate"] > 0],
    }


async def dry_run_migration(project_id: uuid.UUID, sql: str, *, allow_grants: bool = False) -> dict[str, Any]:
    stmts = check_migration(sql, allow_grants=allow_grants)
    pool = await db.tenant_pool(project_id, "owner")
    t0 = time.perf_counter()
    seqs: dict = {}
    try:
        async with pool.acquire() as conn:
            before = await introspect(conn)
            seqs = await snapshot_sequences(conn)
            tr = conn.transaction()
            await tr.start()
            counts: list[int | None] = []
            try:
                # Statement by statement, so the preview can say how many rows each one touches
                # and a failure points at the exact statement. Same transaction => same semantics.
                for i, st in enumerate(stmts):
                    try:
                        status = await conn.execute(st.sql)
                    except asyncpg.PostgresError as e:
                        e.message = f"statement {i + 1} ({st.op}): {e.message}"
                        raise
                    tail = status.split()[-1] if status else ""
                    counts.append(int(tail) if st.kind == "write" and tail.isdigit() else None)
                after = await introspect(conn)
            finally:
                await tr.rollback()
    except Exception as e:
        raise pg_error(e) from None
    finally:
        await restore_sequences(project_id, seqs)
    rows = [c for c in counts if c is not None]
    return {
        "statements": [{"op": s.op, "risk": s.risk, "notes": s.notes, "rows": c} for s, c in zip(stmts, counts)],
        "rows_affected": sum(rows) if rows else None,
        "data_only": all(s.kind == "write" for s in stmts),
        "risk": sqlpolicy.overall_risk(stmts),
        "diff": schema_diff(before, after),
        "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


async def apply_migration(project_id: uuid.UUID, sql: str, summary: str, actor: Actor, *,
                          down_sql: str | None = None, allow_grants: bool = False) -> dict[str, Any]:
    check_migration(sql, allow_grants=allow_grants)
    pool = await db.tenant_pool(project_id, "owner")
    t0 = time.perf_counter()
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(sql)
    except Exception as e:
        err = pg_error(e)
        await audit(project_id, actor, "migration", sql, ok=False, error=str(err))
        raise err from None
    ms = int((time.perf_counter() - t0) * 1000)
    async with db.control().acquire() as c, c.transaction():
        version = await c.fetchval(
            "UPDATE projects SET schema_version = schema_version + 1 WHERE project_id=$1 RETURNING schema_version",
            project_id)
        await c.execute(
            """INSERT INTO schema_versions (project_id, version, summary, up_sql, down_sql, applied_by)
               VALUES ($1,$2,$3,$4,$5,$6)""", project_id, version, summary, sql, down_sql, actor.user_id)
    await audit(project_id, actor, "migration", sql, ok=True, duration_ms=ms)
    return {"version": version, "duration_ms": ms}


# ------------------------------------------------------------------ business roles (real Postgres enforcement)

async def simulate_access(project_id: uuid.UUID, db_role: str, sql: str) -> dict[str, Any]:
    """Run the statement AS the business role inside a rolled-back transaction. Postgres decides."""
    try:
        st = sqlpolicy.single(sql)
    except PolicyError as e:
        return {"allowed": False, "reason": f"blocked by Normie policy: {e}", "layer": "policy"}
    if st.kind == "ddl":
        return {"allowed": False, "reason": "business roles cannot run DDL", "layer": "policy"}
    pool = await db.tenant_pool(project_id, "rw")
    async with pool.acquire() as conn:
        seqs = await snapshot_sequences(conn) if st.kind == "write" else {}
        tr = conn.transaction()
        await tr.start()
        try:
            await conn.execute(f"SET LOCAL ROLE {_q(db_role)}")
            if st.kind == "read":
                rows = await conn.fetch(f"SELECT * FROM ({st.sql.rstrip(';')}) AS _q LIMIT 5")
                return {"allowed": True, "layer": "postgres", "reason": "permitted by GRANTs/RLS",
                        "sample": [jsonable(dict(r)) for r in rows]}
            status = await conn.execute(st.sql)
            return {"allowed": True, "layer": "postgres", "reason": f"permitted ({status}, rolled back)"}
        except asyncpg.PostgresError as e:
            return {"allowed": False, "layer": "postgres", "reason": e.message, "sqlstate": e.sqlstate}
        finally:
            await tr.rollback()
            await restore_sequences(project_id, seqs)


# ------------------------------------------------------------------ tuning

async def benchmark_index(project_id: uuid.UUID, sql: str, index_ddl: str, runs: int = 3) -> dict[str, Any]:
    """Measure a query before/after a candidate index, inside a rolled-back transaction.
    Nothing persists: this is a real 'what-if' on the actual data."""
    st = sqlpolicy.single(sql)
    if st.kind != "read":
        raise ExecError("benchmark only supports SELECT queries", sqlstate="POLICY")
    idx = sqlpolicy.single(index_ddl)
    if idx.op != "CREATE INDEX":
        raise ExecError("index_ddl must be a single CREATE INDEX statement", sqlstate="POLICY")
    pool = await db.tenant_pool(project_id, "owner")

    async def measure(conn) -> tuple[float, dict]:
        times, plan = [], None
        for _ in range(runs):
            out = await conn.fetchval(f"EXPLAIN (ANALYZE, FORMAT JSON) {st.sql}")
            out = json.loads(out) if isinstance(out, str) else out
            times.append(out[0]["Execution Time"])
            plan = out[0]["Plan"]
        times.sort()
        return times[len(times) // 2], plan

    try:
        async with pool.acquire() as conn:
            tr = conn.transaction()
            await tr.start()
            try:
                before_ms, before_plan = await measure(conn)
                await conn.execute(idx.sql.replace("CONCURRENTLY", ""))
                if idx.ast is not None:
                    from sqlglot import exp
                    t = idx.ast.find(exp.Table)
                    if t is not None:
                        await conn.execute(f"ANALYZE {_q(t.name)}")
                after_ms, after_plan = await measure(conn)
            finally:
                await tr.rollback()
    except Exception as e:
        raise pg_error(e) from None
    return {
        "before_ms": round(before_ms, 3), "after_ms": round(after_ms, 3),
        "speedup": round(before_ms / after_ms, 2) if after_ms else None,
        "before_plan": plan_to_text(before_plan), "after_plan": plan_to_text(after_plan),
        "index_used": "Index" in json.dumps(after_plan) and "Index" not in json.dumps(before_plan),
    }


async def slow_queries(project_id: uuid.UUID, limit: int = 20) -> list[dict[str, Any]]:
    rows = await db.control().fetch(
        """SELECT regexp_replace(sql_text, '\\s+', ' ', 'g') AS sql, count(*) AS calls,
                  round(avg(duration_ms)::numeric, 1) AS mean_ms, max(duration_ms) AS max_ms
           FROM audit_log WHERE project_id=$1 AND action='query' AND ok AND duration_ms IS NOT NULL
           GROUP BY 1 ORDER BY avg(duration_ms) DESC LIMIT $2""", project_id, limit)
    return [jsonable(dict(r)) for r in rows]


# ------------------------------------------------------------------ helpers for UI

async def schema(project_id: uuid.UUID) -> dict[str, Any]:
    pool = await db.tenant_pool(project_id, "ro")
    async with pool.acquire() as conn:
        return await introspect(conn)
