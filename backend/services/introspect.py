"""Live schema introspection of a tenant database (public schema) straight from pg_catalog.

The same function is used (a) by the UI (ERD, table editor, autocomplete), (b) to build the compact
schema context handed to the LLM, and (c) inside a rolled-back transaction to preview what a
migration would produce.
"""
from __future__ import annotations

from typing import Any

import asyncpg

TABLES_SQL = """
SELECT c.oid, c.relname AS name, c.relkind::text AS relkind,
       -- reltuples only refreshes on ANALYZE; n_live_tup is updated right after commit
       GREATEST(c.reltuples, COALESCE(st.n_live_tup, 0), 0)::bigint AS row_estimate,
       pg_total_relation_size(c.oid) AS size_bytes,
       obj_description(c.oid, 'pg_class') AS comment,
       c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables st ON st.relid = c.oid
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
ORDER BY c.relkind, c.relname
"""

COLUMNS_SQL = """
SELECT a.attrelid AS oid, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
       NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS default,
       a.attidentity <> '' AS is_identity, a.attgenerated <> '' AS is_generated, a.attnum
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m')
ORDER BY a.attrelid, a.attnum
"""

CONSTRAINTS_SQL = """
SELECT con.conrelid AS oid, con.conname AS name, con.contype::text AS type,
       ARRAY(SELECT attname FROM unnest(con.conkey) WITH ORDINALITY k(n, i)
             JOIN pg_attribute ON attrelid = con.conrelid AND attnum = k.n ORDER BY k.i) AS columns,
       fc.relname AS ref_table,
       ARRAY(SELECT attname FROM unnest(con.confkey) WITH ORDINALITY k(n, i)
             JOIN pg_attribute ON attrelid = con.confrelid AND attnum = k.n ORDER BY k.i) AS ref_columns,
       pg_get_constraintdef(con.oid) AS definition,
       obj_description(con.oid, 'pg_constraint') AS comment,
       CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT'
            WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION' END AS on_delete
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_class fc ON fc.oid = con.confrelid
WHERE n.nspname = 'public'
"""

INDEXES_SQL = """
SELECT i.indrelid AS oid, ic.relname AS name, pg_get_indexdef(i.indexrelid) AS definition,
       i.indisunique AS unique, i.indisprimary AS primary,
       pg_relation_size(i.indexrelid) AS size_bytes
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
"""

ENUMS_SQL = """
SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' GROUP BY t.typname
"""

KIND = {"r": "table", "p": "table", "v": "view", "m": "materialized view"}


async def introspect(conn: asyncpg.Connection) -> dict[str, Any]:
    tables = await conn.fetch(TABLES_SQL)
    cols = await conn.fetch(COLUMNS_SQL)
    cons = await conn.fetch(CONSTRAINTS_SQL)
    idx = await conn.fetch(INDEXES_SQL)
    enums = await conn.fetch(ENUMS_SQL)

    by_oid: dict[int, dict[str, Any]] = {}
    for t in tables:
        by_oid[t["oid"]] = {
            "name": t["name"],
            "kind": KIND[t["relkind"]],
            "row_estimate": int(t["row_estimate"]),
            "size_bytes": int(t["size_bytes"]),
            "comment": t["comment"],
            "rls": t["rls"],
            "columns": [],
            "primary_key": [],
            "foreign_keys": [],
            "unique": [],
            "checks": [],
            "indexes": [],
        }
    for c in cols:
        if c["oid"] in by_oid:
            by_oid[c["oid"]]["columns"].append(
                {
                    "name": c["name"],
                    "type": c["type"],
                    "nullable": c["nullable"],
                    "default": c["default"],
                    "is_identity": c["is_identity"],
                    "is_generated": c["is_generated"],
                }
            )
    for k in cons:
        t = by_oid.get(k["oid"])
        if not t:
            continue
        if k["type"] == "p":
            t["primary_key"] = list(k["columns"])
        elif k["type"] == "f":
            t["foreign_keys"].append(
                {
                    "name": k["name"],
                    "columns": list(k["columns"]),
                    "ref_table": k["ref_table"],
                    "ref_columns": list(k["ref_columns"]),
                    "on_delete": k["on_delete"],
                    "comment": k["comment"],  # optional relationship name for the Chen ER diagram
                }
            )
        elif k["type"] == "u":
            t["unique"].append(list(k["columns"]))
        elif k["type"] == "c":
            t["checks"].append(k["definition"])
    for i in idx:
        t = by_oid.get(i["oid"])
        if t:
            t["indexes"].append(
                {"name": i["name"], "definition": i["definition"], "unique": i["unique"],
                 "primary": i["primary"], "size_bytes": int(i["size_bytes"])}
            )
    for t in by_oid.values():
        pk = set(t["primary_key"])
        fk_cols = {c for fk in t["foreign_keys"] for c in fk["columns"]}
        for c in t["columns"]:
            c["is_pk"] = c["name"] in pk
            c["is_fk"] = c["name"] in fk_cols
    return {
        "tables": [t for t in by_oid.values()],
        "enums": [{"name": e["name"], "labels": list(e["labels"])} for e in enums],
    }


def compact_for_llm(schema: dict[str, Any]) -> str:
    """Token-cheap schema description: names, types, keys, FKs. No data values (SECURITY.md §5)."""
    if not schema["tables"]:
        return "(the database is empty: no tables yet)"
    lines = []
    for e in schema.get("enums", []):
        lines.append(f"enum {e['name']}: {', '.join(e['labels'])}")
    for t in schema["tables"]:
        cols = []
        for c in t["columns"]:
            flags = []
            if c["is_pk"]:
                flags.append("PK")
            if not c["nullable"] and not c["is_pk"]:
                flags.append("NOT NULL")
            if c["default"] and ("nextval" in c["default"] or c["is_identity"]):
                flags.append("auto")
            cols.append(f"{c['name']} {c['type']}{(' ' + ' '.join(flags)) if flags else ''}")
        lines.append(f"{t['kind']} {t['name']} (~{t['row_estimate']} rows): " + "; ".join(cols))
        for fk in t["foreign_keys"]:
            lines.append(
                f"  FK {t['name']}({', '.join(fk['columns'])}) -> {fk['ref_table']}({', '.join(fk['ref_columns'])})"
            )
        for u in t["unique"]:
            lines.append(f"  UNIQUE({', '.join(u)})")
        for ch in t["checks"]:
            lines.append(f"  {ch}")
    return "\n".join(lines)
