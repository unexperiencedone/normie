"""Normie Copilot: one orchestrating PydanticAI agent with specialist toolsets.

Safety model (why the agent can be trusted with a real database):
  * reads run as the `_ro` Postgres role in READ ONLY transactions,
  * every change goes through approvals.request_sql(): real dry run -> risk -> auto-commit only
    low-risk DML, otherwise a pending approval a human must click,
  * the agent never sees credentials, and sees at most `agent_row_preview` rows of data.

Each tool returns a small JSON-able dict for the model. Rich payloads for the UI (full result
sets, approval cards, DDL) are stashed in `deps.ui[tool_call_id]` and streamed to the browser.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent, FunctionToolset, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

from backend.config import get_settings
from backend.core import db
from backend.services import approvals, backups, executor, normalization, security
from backend.services.executor import Actor, ExecError
from backend.services.introspect import compact_for_llm
from backend.services.sqlpolicy import PolicyError
from backend.tools.er.models import Attribute, Entity, ERModel, Generalization, Relationship
from backend.tools.er.mermaid import render_mermaid
from backend.tools.er.validator import validate_er
from backend.tools.fd.closure import attribute_closure, candidate_keys
from backend.tools.fd.cover import minimal_cover
from backend.tools.fd.models import FD
from backend.tools.mapping.ddl import generate_ddl
from backend.tools.mapping.er_to_relational import er_to_relational
from backend.tools.normalization.chase import is_lossless
from backend.tools.normalization.checker import check_normal_form
from backend.tools.normalization.decompose import decompose_3nf, decompose_bcnf
from backend.tools.normalization.preservation import preserves_dependencies
from backend.tools.sql.algebra import to_relational_algebra

PROMPT = (Path(__file__).parent / "prompts" / "copilot.md").read_text()


@dataclass
class Deps:
    project_id: uuid.UUID
    user_id: uuid.UUID
    conversation_id: uuid.UUID
    project_name: str
    ui: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def actor(self) -> Actor:
        return Actor(self.user_id, "agent")


def _err(e: Exception) -> dict[str, Any]:
    err = executor.pg_error(e)
    return {"ok": False, "error": err.payload}


def _ui(ctx: RunContext[Deps], kind: str, data: dict[str, Any]) -> None:
    if ctx.tool_call_id:
        ctx.deps.ui[ctx.tool_call_id] = {"kind": kind, **data}


# =============================================================== Query specialist
query_tools = FunctionToolset[Deps]()


@query_tools.tool
async def get_schema(ctx: RunContext[Deps]) -> dict[str, Any]:
    """Return the current live schema of the project database (tables, columns, types, keys, FKs)."""
    try:
        sch = await executor.schema(ctx.deps.project_id)
    except Exception as e:
        return _err(e)
    _ui(ctx, "schema", {"tables": [t["name"] for t in sch["tables"]]})
    return {"ok": True, "schema": compact_for_llm(sch)}


@query_tools.tool
async def describe_table(ctx: RunContext[Deps], table: str) -> dict[str, Any]:
    """Describe one table in detail: columns, constraints, indexes, size and up to 5 sample rows."""
    try:
        sch = await executor.schema(ctx.deps.project_id)
        t = next((t for t in sch["tables"] if t["name"] == table), None)
        if not t:
            return {"ok": False, "error": f"no table named {table}. Tables: {[x['name'] for x in sch['tables']]}"}
        sample = await executor.run_read(ctx.deps.project_id, f'SELECT * FROM "{table}" LIMIT 5', ctx.deps.actor)
    except Exception as e:
        return _err(e)
    return {"ok": True, "table": t, "sample_rows": {"columns": [c["name"] for c in sample["columns"]],
                                                     "rows": sample["rows"]}}


@query_tools.tool
async def run_query(ctx: RunContext[Deps], sql: str, purpose: str = "") -> dict[str, Any]:
    """Run ONE read-only SELECT against the database. The full result is shown to the user as a table;
    you receive only a preview. `purpose` is a short description shown above the result."""
    s = get_settings()
    try:
        res = await executor.run_read(ctx.deps.project_id, sql, ctx.deps.actor)
    except Exception as e:
        return _err(e)
    algebra = to_relational_algebra(sql).unicode_str
    _ui(ctx, "result", {"sql": sql, "purpose": purpose, "algebra": algebra, **res})
    return {
        "ok": True,
        "columns": [c["name"] for c in res["columns"]],
        "row_count": res["row_count"],
        "truncated": res["truncated"],
        "preview_rows": res["rows"][: s.agent_row_preview],
        "relational_algebra": algebra,
        "duration_ms": res["duration_ms"],
    }


@query_tools.tool
async def explain_query(ctx: RunContext[Deps], sql: str, analyze: bool = False) -> dict[str, Any]:
    """Show the PostgreSQL query plan. analyze=true actually runs it (writes are rolled back) for real timings."""
    try:
        res = await executor.explain(ctx.deps.project_id, sql, analyze=analyze)
    except Exception as e:
        return _err(e)
    _ui(ctx, "plan", {"sql": sql, **{k: v for k, v in res.items() if k != "plan"}})
    return {"ok": True, "plan": res["text"], "total_cost": res["total_cost"], "execution_ms": res["execution_ms"]}


# =============================================================== Transaction + Schema specialists
change_tools = FunctionToolset[Deps]()


@change_tools.tool
async def propose_change(ctx: RunContext[Deps], sql: str, summary: str, down_sql: str | None = None) -> dict[str, Any]:
    """Propose a change to the database: DDL (CREATE/ALTER/DROP ...) and/or DML (INSERT/UPDATE/DELETE).
    Normie dry-runs it for real, classifies the risk, then either commits it (low-risk DML) or creates
    an approval the user must accept. `summary` is a one-line human description; `down_sql` reverses a migration."""
    try:
        r = await approvals.request_sql(ctx.deps.project_id, sql, summary, ctx.deps.actor, down_sql=down_sql,
                                        conversation_id=ctx.deps.conversation_id)
    except Exception as e:
        return _err(e)
    if r["status"] == "executed":
        _ui(ctx, "executed", {"sql": sql, "summary": summary, **r["result"]})
        return {"ok": True, "status": "executed", "rows_affected": r["result"]["rows_affected"],
                "note": "committed (low risk, auto-approved)"}
    a = r["approval"]
    _ui(ctx, "approval", {"approval": a})
    pv = a["preview"]
    brief = {k: pv[k] for k in ("rows_affected", "diff", "statements", "notes") if k in pv}
    return {"ok": True, "status": "pending_approval", "approval_id": a["approval_id"], "risk": a["risk"],
            "preview": brief, "note": "NOT applied yet: waiting for the user to approve in the UI"}


# =============================================================== Design / normalisation specialist
design_tools = FunctionToolset[Deps]()


class ERAttr(BaseModel):
    name: str
    type: str = Field("text", description="PostgreSQL type, e.g. text, integer, numeric(10,2), date, timestamptz")
    is_pk: bool = False
    nullable: bool = True
    multivalued: bool = False


class EREntity(BaseModel):
    name: str
    attributes: list[ERAttr]
    is_weak: bool = False
    owner_entity: str | None = None
    partial_keys: list[str] = Field(default_factory=list)


class ERRel(BaseModel):
    name: str
    entities: list[str] = Field(description="exactly two entity names [A, B]")
    cardinality: Literal["1:1", "1:N", "N:1", "M:N"]
    total_participation: list[str] = Field(default_factory=list, description="entities that MUST participate")
    attributes: list[ERAttr] = Field(default_factory=list)


class ERIsa(BaseModel):
    parent: str
    children: list[str]
    disjoint: bool = True
    total: bool = False


def _attr(a: ERAttr) -> Attribute:
    return Attribute(name=a.name, type=a.type, is_pk=a.is_pk, is_nullable=a.nullable, is_multivalued=a.multivalued)


@design_tools.tool
async def design_from_er(ctx: RunContext[Deps], entities: list[EREntity], relationships: list[ERRel],
                         generalizations: list[ERIsa] | None = None) -> dict[str, Any]:
    """Validate an Entity-Relationship model and map it to relational tables with the textbook rules
    (1:N -> FK on N side, M:N -> junction table, weak entity -> composite PK, multivalued -> own table,
    ISA -> table per subclass). Returns validation errors or generated DDL + a Mermaid ER diagram."""
    try:
        model = ERModel(
            entities=[Entity(name=e.name, attributes=[_attr(a) for a in e.attributes], is_weak=e.is_weak,
                             owner_entity=e.owner_entity, partial_keys=e.partial_keys) for e in entities],
            relationships=[Relationship(
                name=r.name, entities=r.entities, cardinality=r.cardinality,
                participation={n: ("total" if n in r.total_participation else "partial") for n in r.entities},
                attributes=[_attr(a) for a in r.attributes]) for r in relationships],
            generalizations=[Generalization(parent_entity=g.parent, child_entities=g.children,
                                            is_disjoint=g.disjoint, is_total=g.total) for g in (generalizations or [])],
        )
        ok, errors = validate_er(model)
        if not ok:
            return {"ok": False, "validation_errors": errors}
        rel = er_to_relational(model)
        ddl = generate_ddl(rel)
        mermaid = render_mermaid(model)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    tables = [{"name": t.name, "columns": [c.name for c in t.columns], "primary_key": t.primary_key,
               "foreign_keys": [f"{fk.columns}->{fk.ref_table}" for fk in t.foreign_keys]} for t in rel.tables]
    _ui(ctx, "design", {"mermaid": mermaid, "ddl": ddl, "tables": tables})
    return {"ok": True, "tables": tables, "generated_ddl": ddl,
            "next": "refine types/constraints per your guidelines, then propose_change the final DDL"}


class FDIn(BaseModel):
    lhs: list[str]
    rhs: list[str]


@design_tools.tool
async def discover_fds(ctx: RunContext[Deps], table: str) -> dict[str, Any]:
    """Functional dependencies of a real table: DECLARED ones (primary key / UNIQUE constraints) and
    ones OBSERVED in its current data (1- and 2-column determinants). Observed FDs are hypotheses:
    confirm them with domain knowledge before passing them to analyze_normalization."""
    try:
        t = await normalization.table_info(ctx.deps.project_id, table)
        obs = await normalization.discover_fds(ctx.deps.project_id, t)
    except Exception as e:
        return _err(e)
    return {"ok": True, "attributes": [c["name"] for c in t["columns"]], "declared": normalization.declared_fds(t),
            "observed": obs["fds"], "rows": obs["rows"], "note": obs.get("note")}


@design_tools.tool
async def analyze_normalization(ctx: RunContext[Deps], table: str, attributes: list[str],
                                fds: list[FDIn]) -> dict[str, Any]:
    """Deterministic normalisation analysis of one relation given its functional dependencies:
    closures, candidate keys, minimal cover, highest normal form with violations, and lossless
    3NF and BCNF decompositions (checked with the chase and dependency preservation)."""
    try:
        attrs = set(attributes)
        f = [FD(frozenset(x.lhs), frozenset(x.rhs)) for x in fds]
        unknown = {a for x in f for a in x.lhs | x.rhs} - attrs
        if unknown:
            return {"ok": False, "error": f"FDs reference attributes not in the relation: {sorted(unknown)}"}
        report = check_normal_form(attrs, f).to_dict()
        keys = [sorted(k) for k in candidate_keys(attrs, f)]
        cover = [x.to_dict() for x in minimal_cover(f)]
        out: dict[str, Any] = {"ok": True, "table": table, "candidate_keys": keys, "minimal_cover": cover,
                               "highest_normal_form": report["highest_nf"], "violations": report["violations"],
                               "closures": {",".join(sorted(x.lhs)): sorted(attribute_closure(set(x.lhs), f)) for x in f}}
        if report["highest_nf"] != "BCNF":
            for target, fn in (("3NF", decompose_3nf), ("BCNF", decompose_bcnf)):
                parts = fn(attrs, f)
                lossless, _, _ = is_lossless(attrs, parts, f)
                preserved, lost = preserves_dependencies(attrs, parts, f)
                out[f"decomposition_{target}"] = {"relations": [sorted(p) for p in parts], "lossless": lossless,
                                                  "dependency_preserving": preserved,
                                                  "lost_fds": [x.to_dict() for x in lost]}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    _ui(ctx, "normalization", out)
    return out


# =============================================================== Security specialist
security_tools = FunctionToolset[Deps]()


@security_tools.tool
async def create_business_role(ctx: RunContext[Deps], spec: security.RoleSpec) -> dict[str, Any]:
    """Create or replace a business role (e.g. receptionist) as a real PostgreSQL role with column-level
    GRANTs, a per-role view of visible columns, and optional row filters (row-level security).
    Always requires user approval."""
    try:
        r = await approvals.request_role(ctx.deps.project_id, spec, ctx.deps.actor,
                                         conversation_id=ctx.deps.conversation_id)
    except Exception as e:
        return _err(e)
    _ui(ctx, "approval", {"approval": r["approval"]})
    return {"ok": True, "status": "pending_approval", "approval_id": r["approval"]["approval_id"],
            "generated_sql": r["approval"]["sql_text"], "note": "NOT applied until the user approves"}


@security_tools.tool
async def test_access(ctx: RunContext[Deps], role: str, sql: str) -> dict[str, Any]:
    """Check whether a business role may run a statement. It is executed AS that role inside a rolled-back
    transaction, so PostgreSQL itself decides (GRANTs + row-level security)."""
    try:
        db_role = await security.get_db_role(ctx.deps.project_id, role)
        res = await executor.simulate_access(ctx.deps.project_id, db_role, sql)
    except Exception as e:
        return _err(e)
    _ui(ctx, "access", {"role": role, "sql": sql, **res})
    return {"ok": True, **res}


# =============================================================== Tuning specialist
tuning_tools = FunctionToolset[Deps]()


@tuning_tools.tool
async def slow_queries(ctx: RunContext[Deps]) -> dict[str, Any]:
    """List the slowest queries run on this project (from Normie's own statement log)."""
    try:
        return {"ok": True, "queries": await executor.slow_queries(ctx.deps.project_id, 10)}
    except Exception as e:
        return _err(e)


@tuning_tools.tool
async def benchmark_index(ctx: RunContext[Deps], sql: str, index_ddl: str) -> dict[str, Any]:
    """Measure a SELECT before and after a candidate `CREATE INDEX`, on the real data, inside a transaction
    that is rolled back (nothing persists). Returns median timings, speedup and both plans."""
    try:
        res = await executor.benchmark_index(ctx.deps.project_id, sql, index_ddl)
    except Exception as e:
        return _err(e)
    _ui(ctx, "benchmark", {"sql": sql, "index_ddl": index_ddl, **res})
    return {"ok": True, **res}


# =============================================================== Recovery specialist
recovery_tools = FunctionToolset[Deps]()


@recovery_tools.tool
async def recent_activity(ctx: RunContext[Deps], limit: int = 15) -> dict[str, Any]:
    """Recent audit-log entries (writes, migrations, undos) with ids usable by request_undo."""
    rows = await db.control().fetch(
        """SELECT audit_id, actor, action, left(sql_text, 200) AS sql, ok, rows_affected,
                  undo IS NOT NULL AS reversible, undone_by IS NOT NULL AS undone, created_at
           FROM audit_log WHERE project_id=$1 AND action <> 'query' ORDER BY audit_id DESC LIMIT $2""",
        ctx.deps.project_id, min(limit, 50))
    return {"ok": True, "entries": [executor.jsonable(dict(r)) for r in rows]}


@recovery_tools.tool
async def request_undo(ctx: RunContext[Deps], audit_id: int) -> dict[str, Any]:
    """Prepare reversing a previous write using its captured before-image (needs user approval)."""
    try:
        r = await approvals.request_undo(ctx.deps.project_id, audit_id, ctx.deps.actor, ctx.deps.conversation_id)
    except Exception as e:
        return _err(e)
    _ui(ctx, "approval", {"approval": r["approval"]})
    return {"ok": True, "status": "pending_approval", "approval_id": r["approval"]["approval_id"]}


@recovery_tools.tool
async def create_backup(ctx: RunContext[Deps], label: str) -> dict[str, Any]:
    """Take a full logical backup (pg_dump) of the project database now."""
    try:
        return {"ok": True, **await backups.create_backup(ctx.deps.project_id, label, ctx.deps.user_id)}
    except Exception as e:
        return _err(e)


# =============================================================== agent

TOOLSETS = [query_tools, change_tools, design_tools, security_tools, tuning_tools, recovery_tools]


def build_model() -> OpenAIChatModel:
    s = get_settings()
    if not s.llm_api_key:
        raise RuntimeError("LLM is not configured: set AGENT_API_KEY / LLM_API_KEY in .env")
    return OpenAIChatModel(s.llm_model, provider=OpenAIProvider(base_url=s.llm_base_url, api_key=s.llm_api_key))


agent = Agent[Deps, str](
    deps_type=Deps,
    instructions=PROMPT,
    toolsets=TOOLSETS,
    retries=2,
    defer_model_check=True,
)


@agent.instructions
async def live_context(ctx: RunContext[Deps]) -> str:
    """Fresh every turn: project, live schema, and what happened to recent approvals."""
    try:
        sch = compact_for_llm(await executor.schema(ctx.deps.project_id))
    except Exception as e:  # pragma: no cover
        sch = f"(schema unavailable: {e})"
    appr = await db.control().fetch(
        """SELECT left(summary, 120) AS summary, kind, risk, status, decided_at
           FROM approvals WHERE project_id=$1 ORDER BY created_at DESC LIMIT 6""", ctx.deps.project_id)
    lines = [f"- [{a['status']}] {a['kind']} ({a['risk']}): {a['summary']}" for a in appr] or ["- none"]
    return (
        f"## Live context\nProject: **{ctx.deps.project_name}** (PostgreSQL 18)\n\n"
        f"### Current schema\n{sch}\n\n### Recent approvals (newest first)\n" + "\n".join(lines)
    )


def model_settings() -> ModelSettings:
    s = get_settings()
    return ModelSettings(temperature=0.2, max_tokens=8192, timeout=s.llm_timeout_s)
