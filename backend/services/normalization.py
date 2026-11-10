"""Normalisation connected to a project's real tables.

Functional dependencies come from two places:
  * DECLARED: guaranteed by constraints. The primary key and every UNIQUE constraint determine
    every other column of the table.
  * OBSERVED: hold in the table's current data (X -> A iff no X-group has >1 distinct A).
    The data can only *suggest* an FD (it may hold by coincidence), so these are presented
    as hypotheses that the designer confirms (AGENTS.md: the user confirms FDs, code analyses).

All queries run as the read-only role inside a READ ONLY transaction.
"""
from __future__ import annotations

import itertools
import uuid
from typing import Any

from backend.core import db
from backend.services import executor
from backend.tools.fd.closure import candidate_keys
from backend.tools.fd.models import FD
from backend.tools.normalization.chase import is_lossless
from backend.tools.normalization.checker import check_normal_form
from backend.tools.normalization.decompose import decompose_3nf, decompose_bcnf
from backend.tools.normalization.preservation import preserves_dependencies

MAX_COLS = 14  # pairs grow as n(n-1)/2: 14 columns => 91 pair checks
SAMPLE_ROWS = 200_000
UNCOMPARABLE = ("json", "xml", "point", "polygon", "line", "box", "circle", "path", "tsvector")


def _q(i: str) -> str:
    return '"' + i.replace('"', '""') + '"'


async def table_info(project_id: uuid.UUID, table: str) -> dict:
    sch = await executor.schema(project_id)
    t = next((t for t in sch["tables"] if t["name"] == table and t["kind"] == "table"), None)
    if not t:
        raise LookupError(f"table {table} not found")
    return t


def declared_fds(t: dict) -> list[dict[str, Any]]:
    cols = [c["name"] for c in t["columns"]]
    out = []
    keys = ([("primary key", t["primary_key"])] if t["primary_key"] else []) + [("unique", u) for u in t["unique"]]
    for label, key in keys:
        rhs = [c for c in cols if c not in key]
        if rhs:
            out.append({"lhs": list(key), "rhs": rhs, "source": "key", "label": label})
    return out


async def discover_fds(project_id: uuid.UUID, t: dict, *, max_lhs: int = 2) -> dict[str, Any]:
    """FDs with 1- or 2-column determinants that hold in the current data, minimal and non-trivial."""
    cols = [c["name"] for c in t["columns"]
            if not c["is_generated"] and not any(c["type"].startswith(u) for u in UNCOMPARABLE)][:MAX_COLS]
    pool = await db.tenant_pool(project_id, "ro")
    tq = _q(t["name"])
    async with pool.acquire() as conn:
        async with conn.transaction(readonly=True):
            n = await conn.fetchval(f"SELECT count(*) FROM {tq}")
            if n < 2:
                return {"rows": n, "fds": [], "note": "needs at least 2 rows to observe dependencies"}
            src = tq if n <= SAMPLE_ROWS else f"(SELECT * FROM {tq} LIMIT {SAMPLE_ROWS}) s"
            note = None if n <= SAMPLE_ROWS else f"observed on the first {SAMPLE_ROWS} rows"
            # distinct counts per column: constants (<=1 value) are excluded as RHS (∅ -> A is uninteresting)
            nd = await conn.fetchrow("SELECT " + ", ".join(f"count(DISTINCT {_q(c)}) AS {_q(c)}" for c in cols) + f" FROM {src}")
            sample_n = min(n, SAMPLE_ROWS)
            varying = [c for c in cols if nd[c] > 1]
            found: dict[tuple[str, ...], set[str]] = {}
            unique_lhs: set[tuple[str, ...]] = set()
            for size in range(1, max_lhs + 1):
                for lhs in itertools.combinations(varying, size):
                    # an LHS containing a (data-)unique column is a superkey: it determines everything
                    if any((c,) in unique_lhs for c in lhs):
                        continue
                    targets = [a for a in varying if a not in lhs
                               and not any(set(k) < set(lhs) and a in v for k, v in found.items())]  # minimality
                    if not targets:
                        continue
                    lcols = ", ".join(_q(c) for c in lhs)
                    inner = ", ".join(f"count(DISTINCT {_q(a)}) AS d{i}" for i, a in enumerate(targets))
                    outer = ", ".join(f"count(*) FILTER (WHERE d{i} > 1) AS v{i}" for i in range(len(targets)))
                    r = await conn.fetchrow(
                        f"SELECT count(*) AS groups, {outer} FROM (SELECT {lcols}, {inner} FROM {src} GROUP BY {lcols}) g")
                    if r["groups"] == sample_n:
                        unique_lhs.add(lhs)  # every value distinct: superkey in the data, skip
                        continue
                    holds = {a for i, a in enumerate(targets) if r[f"v{i}"] == 0}
                    if holds:
                        found[lhs] = holds
    fds = [{"lhs": list(k), "rhs": sorted(v), "source": "data", "label": f"holds in {sample_n} rows"} for k, v in found.items()]
    return {"rows": n, "fds": fds, "note": note, "unique_in_data": [list(u) for u in unique_lhs]}


def analyze(attributes: list[str], fds_in: list[dict]) -> dict[str, Any]:
    attrs = {a for a in attributes if a}
    fds = [FD(frozenset(f["lhs"]), frozenset(f["rhs"])) for f in fds_in if f["lhs"] and f["rhs"]]
    unknown = {a for f in fds for a in f.lhs | f.rhs} - attrs
    if unknown:
        raise ValueError(f"FDs use attributes not in the relation: {sorted(unknown)}")
    rep = check_normal_form(attrs, fds).to_dict()
    out: dict[str, Any] = {"report": rep, "candidate_keys": [sorted(k) for k in candidate_keys(attrs, fds)]}
    for target, fn in (("3nf", decompose_3nf), ("bcnf", decompose_bcnf)):
        parts = fn(attrs, fds)
        ll, tableau, order = is_lossless(attrs, parts, fds)
        pres, lost = preserves_dependencies(attrs, parts, fds)
        out[target] = {"relations": [sorted(p) for p in parts], "lossless": ll, "chase_tableau": tableau,
                       "attribute_order": order, "dependency_preserving": pres, "lost": [f.to_dict() for f in lost]}
    return out


def decomposition_sql(table: str, fds_in: list[dict], parts: list[list[str]]) -> tuple[str, str, list[dict]]:
    """Deterministic migration for a decomposition: one new table per part, filled with
    SELECT DISTINCT from the original and keyed by the part's candidate key. The original table
    is kept, so nothing is lost; point the application at the new tables, then drop it."""
    fds = [FD(frozenset(f["lhs"]), frozenset(f["rhs"])) for f in fds_in if f["lhs"] and f["rhs"]]
    used: set[str] = set()
    up, down, plan = [f"-- decompose {table} into {len(parts)} relations (original table is kept)"], [], []
    for part in parts:
        key = sorted(candidate_keys(set(part), fds)[0])
        base = f"{table}_{'_'.join(key)}"[:55]
        name, k = base, 2
        while name in used or name == table:
            name, k = f"{base}_{k}", k + 1
        used.add(name)
        cols = ", ".join(_q(c) for c in part)
        not_null = " AND ".join(f"{_q(c)} IS NOT NULL" for c in key)
        up.append(f"CREATE TABLE {_q(name)} AS SELECT DISTINCT {cols} FROM {_q(table)} WHERE {not_null};")
        up.append(f"ALTER TABLE {_q(name)} ADD PRIMARY KEY ({', '.join(_q(c) for c in key)});")
        down.append(f"DROP TABLE IF EXISTS {_q(name)};")
        plan.append({"table": name, "columns": part, "key": key})
    return "\n".join(up), "\n".join(reversed(down)), plan


async def schema_health(project_id: uuid.UUID) -> list[dict[str, Any]]:
    """Highest normal form of every table: from declared keys alone, and with observed FDs."""
    sch = await executor.schema(project_id)
    out = []
    for t in [t for t in sch["tables"] if t["kind"] == "table"]:
        attrs = [c["name"] for c in t["columns"]]
        dec = declared_fds(t)
        try:
            obs = (await discover_fds(project_id, t, max_lhs=1))["fds"]
        except Exception:
            obs = []
        nf_declared = check_normal_form(set(attrs), [FD(frozenset(f["lhs"]), frozenset(f["rhs"])) for f in dec]).highest_nf
        both = dec + obs
        nf_observed = check_normal_form(set(attrs), [FD(frozenset(f["lhs"]), frozenset(f["rhs"])) for f in both]).highest_nf
        out.append({"table": t["name"], "rows": t["row_estimate"], "nf_declared": str(nf_declared),
                    "nf_observed": str(nf_observed), "observed_fds": obs})
    return out
