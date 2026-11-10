"""The human-in-the-loop gate (AGENTS.md principle 3).

Every side-effecting request — from the agent OR from the user's own SQL editor — goes through
`request_sql()` / `request_role()` / `request_undo()` / `request_restore()`:

  1. classify (sqlpolicy) and DRY-RUN it for real inside a rolled-back transaction,
  2. finalise the risk from what the dry run touched,
  3. low-risk DML auto-commits (if the project allows it); everything else becomes a pending
     approval with the preview attached,
  4. `decide()` executes it on approval, with a commit-time drift check.
"""
from __future__ import annotations

import uuid
from typing import Any

from backend.core import db
from backend.services import backups, executor, security, sqlpolicy
from backend.services.executor import Actor, ExecError
from backend.services.sqlpolicy import PolicyError


def _row(r) -> dict[str, Any]:
    d = executor.jsonable(dict(r))
    return d


async def _create(project_id, actor: Actor, *, kind: str, risk: str, summary: str, sql: str,
                  preview: dict, payload: dict | None = None, down_sql: str | None = None,
                  conversation_id: uuid.UUID | None = None) -> dict:
    r = await db.control().fetchrow(
        """INSERT INTO approvals (project_id, requested_by, source, kind, risk, summary, sql_text, down_sql,
                                  preview, payload, conversation_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *""",
        project_id, actor.user_id, "agent" if actor.kind == "agent" else "user", kind, risk, summary, sql,
        down_sql, preview, payload or {}, conversation_id)
    return _row(r)


async def request_sql(project_id: uuid.UUID, sql: str, summary: str, actor: Actor, *,
                      down_sql: str | None = None, conversation_id: uuid.UUID | None = None) -> dict:
    stmts = sqlpolicy.parse(sql)
    if all(s.kind == "read" for s in stmts):
        raise ExecError("read-only statements don't need approval; run them as a query", sqlstate="POLICY")

    if len(stmts) == 1 and stmts[0].kind == "write":
        preview = await executor.dry_run_write(project_id, sql)
        risk = preview["risk"]
        auto = await db.control().fetchval("SELECT auto_approve_low_risk FROM projects WHERE project_id=$1", project_id)
        if risk == "low" and auto:
            result = await executor.commit_write(project_id, sql, actor, max_rows=preview["rows_affected"])
            return {"status": "executed", "risk": risk, "result": result, "summary": summary}
        appr = await _create(project_id, actor, kind="write", risk=risk, summary=summary, sql=sql,
                             preview=preview, conversation_id=conversation_id)
        return {"status": "pending_approval", "approval": appr}

    preview = await executor.dry_run_migration(project_id, sql)
    risk = sqlpolicy.overall_risk(stmts)
    if any(s.kind == "ddl" and s.op != "COMMENT" for s in stmts):
        risk = max(risk, "medium", key=lambda r: sqlpolicy.RISK_ORDER[r])
    if preview["diff"]["row_loss_risk"]:
        risk = "high"
    appr = await _create(project_id, actor, kind="migration", risk=risk, summary=summary, sql=sql,
                         preview=preview, down_sql=down_sql, conversation_id=conversation_id)
    return {"status": "pending_approval", "approval": appr}


async def request_role(project_id: uuid.UUID, spec: security.RoleSpec, actor: Actor, *,
                       conversation_id: uuid.UUID | None = None) -> dict:
    built = await security.build_role_sql(project_id, spec)
    # The NOLOGIN role is harmless on its own; it must exist for the GRANT dry run.
    await security.ensure_db_role(project_id, built["db_role"])
    preview = await executor.dry_run_migration(project_id, built["sql"], allow_grants=True)
    preview["views"] = built["views"]
    appr = await _create(project_id, actor, kind="role", risk="medium",
                         summary=f"Create/replace business role '{spec.name}'", sql=built["sql"],
                         preview=preview, payload=spec.model_dump(), conversation_id=conversation_id)
    return {"status": "pending_approval", "approval": appr}


async def request_undo(project_id: uuid.UUID, audit_id: int, actor: Actor,
                       conversation_id: uuid.UUID | None = None) -> dict:
    preview = await executor.apply_undo(project_id, audit_id, actor, dry_run=True)
    appr = await _create(project_id, actor, kind="undo", risk="medium",
                         summary=f"Undo audit #{audit_id} ({preview['op']} on {preview['table']})",
                         sql=preview["sql"], preview=preview, payload={"audit_id": audit_id},
                         conversation_id=conversation_id)
    return {"status": "pending_approval", "approval": appr}


async def request_restore(project_id: uuid.UUID, backup_id: uuid.UUID, actor: Actor) -> dict:
    b = await db.control().fetchrow("SELECT label, created_at FROM backups WHERE project_id=$1 AND backup_id=$2",
                                    project_id, backup_id)
    if not b:
        raise LookupError("backup not found")
    appr = await _create(project_id, actor, kind="restore", risk="high",
                         summary=f"Restore backup '{b['label']}' from {b['created_at']:%Y-%m-%d %H:%M}",
                         sql=f"pg_restore --clean ({backup_id})", preview={}, payload={"backup_id": str(backup_id)})
    return {"status": "pending_approval", "approval": appr}


async def decide(project_id: uuid.UUID, approval_id: uuid.UUID, user_id: uuid.UUID, approve: bool) -> dict:
    async with db.control().acquire() as c, c.transaction():
        a = await c.fetchrow(
            "SELECT * FROM approvals WHERE project_id=$1 AND approval_id=$2 FOR UPDATE", project_id, approval_id)
        if not a:
            raise LookupError("approval not found")
        if a["status"] != "pending":
            raise ExecError(f"approval already {a['status']}")
        if not approve:
            r = await c.fetchrow(
                "UPDATE approvals SET status='rejected', decided_by=$2, decided_at=now() WHERE approval_id=$1 RETURNING *",
                approval_id, user_id)
            return _row(r)
        # claim it so a double-click can't execute twice
        await c.execute("UPDATE approvals SET status='approved', decided_by=$2, decided_at=now() WHERE approval_id=$1",
                        approval_id, user_id)

    actor = Actor(user_id, "user")
    try:
        kind = a["kind"]
        if kind == "write":
            result = await executor.commit_write(project_id, a["sql_text"], actor,
                                                 max_rows=a["preview"].get("rows_affected"))
        elif kind == "migration":
            if a["risk"] == "high":
                await backups.create_backup(project_id, f"auto: before '{a['summary'][:60]}'", user_id)
            result = await executor.apply_migration(project_id, a["sql_text"], a["summary"], actor,
                                                    down_sql=a["down_sql"])
        elif kind == "role":
            result = await security.apply_role(project_id, security.RoleSpec(**a["payload"]), actor)
        elif kind == "undo":
            result = await executor.apply_undo(project_id, int(a["payload"]["audit_id"]), actor, dry_run=False)
        elif kind == "restore":
            await backups.create_backup(project_id, "auto: before restore", user_id)
            result = await backups.restore_backup(project_id, uuid.UUID(a["payload"]["backup_id"]), actor)
        else:
            raise ExecError(f"unknown approval kind {kind}")
        status, res = "approved", {"ok": True, **executor.jsonable(result)}
    except (ExecError, PolicyError, LookupError, RuntimeError) as e:
        err = executor.pg_error(e) if not isinstance(e, ExecError) else e
        status, res = "failed", {"ok": False, "error": getattr(err, "payload", {"message": str(e)})}
    r = await db.control().fetchrow(
        "UPDATE approvals SET status=$2, result=$3 WHERE approval_id=$1 RETURNING *", approval_id, status, res)
    return _row(r)
