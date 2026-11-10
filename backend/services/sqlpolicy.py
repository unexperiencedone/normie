"""Deterministic SQL policy: parse with sqlglot, classify each statement, assign a risk level.

This is the *first* line of defence. The second (and authoritative) one is PostgreSQL itself:
reads run as the `_ro` role inside READ ONLY transactions, writes as `_rw`, DDL as `_owner`
only after human approval. So even if this parser were fooled, the database would refuse.

Risk policy (documented in docs/HOW_IT_WORKS.md):
  low     SELECT; INSERT; UPDATE/DELETE that touches <= 1 row
  medium  UPDATE/DELETE touching 2..100 rows; CREATE TABLE/INDEX/VIEW/TYPE/FUNCTION/TRIGGER;
          ALTER TABLE ADD/RENAME; GRANT; COMMENT
  high    UPDATE/DELETE without WHERE or > 100 rows; DROP; TRUNCATE; ALTER ... DROP/TYPE;
          REVOKE; anything sqlglot can only parse as a raw Command
Row-dependent risks are finalised after the dry run (see executor.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import sqlglot
from sqlglot import exp

Kind = Literal["read", "write", "ddl"]
Risk = Literal["low", "medium", "high"]
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}

DENIED_FUNCTIONS = {
    "pg_sleep", "pg_sleep_for", "pg_sleep_until", "dblink", "dblink_exec", "dblink_connect",
    "pg_read_file", "pg_read_binary_file", "pg_write_file", "pg_ls_dir", "pg_stat_file",
    "lo_import", "lo_export", "pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf",
    "set_config", "pg_promote", "pg_switch_wal", "query_to_xml", "pg_execute_server_program",
}
# Raw commands (unparsed by sqlglot) that we never run on behalf of a tenant.
DENIED_COMMAND_PREFIXES = (
    "CREATE ROLE", "CREATE USER", "ALTER ROLE", "ALTER USER", "DROP ROLE", "DROP USER", "SET ROLE",
    "SET SESSION", "RESET ROLE", "SET LOCAL ROLE", "COPY", "CREATE EXTENSION", "ALTER SYSTEM", "LOAD",
    "CREATE DATABASE", "DROP DATABASE", "ALTER DATABASE", "CREATE SERVER", "CREATE SUBSCRIPTION",
    "CREATE PUBLICATION", "DO", "CALL", "LISTEN", "NOTIFY", "VACUUM", "CHECKPOINT", "CLUSTER",
    "REINDEX", "SECURITY LABEL", "IMPORT FOREIGN", "CREATE FOREIGN",
)
SYSTEM_SCHEMAS = {"pg_catalog", "information_schema", "pg_toast"}


class PolicyError(ValueError):
    pass


@dataclass
class Statement:
    sql: str
    kind: Kind
    op: str  # SELECT, INSERT, UPDATE, DELETE, MERGE, CREATE TABLE, DROP TABLE, ...
    risk: Risk
    ast: exp.Expression | None = None
    target_table: str | None = None
    has_where: bool = True
    notes: list[str] = field(default_factory=list)


def _max_risk(*risks: Risk) -> Risk:
    return max(risks, key=lambda r: RISK_ORDER[r])


def _check_functions(ast: exp.Expression) -> None:
    for fn in ast.find_all(exp.Func):
        name = (fn.name if isinstance(fn, exp.Anonymous) else fn.sql_name()).lower()
        if name in DENIED_FUNCTIONS:
            raise PolicyError(f"function '{name}' is not allowed")


def _check_system_tables(ast: exp.Expression) -> None:
    for t in ast.find_all(exp.Table):
        schema = (t.db or "").lower()
        if schema in SYSTEM_SCHEMAS or t.name.lower().startswith("pg_"):
            raise PolicyError(f"access to system catalog '{t.sql()}' is not allowed")
        if schema and schema != "public":
            raise PolicyError(f"only the public schema is accessible (got '{schema}')")


def _classify(ast: exp.Expression, raw: str) -> Statement:
    if isinstance(ast, exp.Command):
        head = raw.strip().upper()
        for p in DENIED_COMMAND_PREFIXES:
            if head.startswith(p):
                raise PolicyError(f"'{p}' statements are not allowed")
        if head.startswith("EXPLAIN"):
            raise PolicyError("use the Explain action instead of an EXPLAIN statement")
        return Statement(raw, "ddl", head.split()[0] if head else "COMMAND", "high", ast,
                         notes=["unparsed statement: treated as high risk"])

    _check_functions(ast)
    _check_system_tables(ast)

    if isinstance(ast, exp.Copy):
        raise PolicyError("COPY is not allowed")

    if isinstance(ast, (exp.Select, exp.SetOperation)) or (isinstance(ast, exp.Subquery)):
        # data-modifying CTEs make a SELECT a write
        if ast.find(exp.Insert, exp.Update, exp.Delete, exp.Merge):
            return Statement(raw, "write", "WITH-WRITE", "high", ast, notes=[
                "data-modifying CTE: writes several tables in one statement; the row count shown "
                "is only the outer statement's (PostgreSQL does not report the inner ones)"])
        if ast.find(exp.Into):
            raise PolicyError("SELECT INTO is not allowed; use CREATE TABLE AS in a migration")
        return Statement(raw, "read", "SELECT", "low", ast)

    if isinstance(ast, exp.Insert):
        tgt = ast.find(exp.Table)
        return Statement(raw, "write", "INSERT", "low", ast, target_table=tgt.name if tgt else None)

    if isinstance(ast, (exp.Update, exp.Delete)):
        op = "UPDATE" if isinstance(ast, exp.Update) else "DELETE"
        tgt = ast.this if isinstance(ast.this, exp.Table) else ast.find(exp.Table)
        has_where = ast.args.get("where") is not None
        st = Statement(raw, "write", op, "medium" if has_where else "high", ast,
                       target_table=tgt.name if tgt else None, has_where=has_where)
        if not has_where:
            st.notes.append(f"{op} without WHERE affects every row")
        return st

    if isinstance(ast, exp.Merge):
        return Statement(raw, "write", "MERGE", "high", ast)

    if isinstance(ast, exp.TruncateTable):
        return Statement(raw, "ddl", "TRUNCATE", "high", ast)

    if isinstance(ast, exp.Drop):
        return Statement(raw, "ddl", f"DROP {ast.args.get('kind') or ''}".strip(), "high", ast)

    if isinstance(ast, exp.Alter):
        actions = ast.args.get("actions") or []
        risky = any(isinstance(a, (exp.Drop, exp.AlterColumn)) or "DROP" in a.sql().upper() for a in actions)
        return Statement(raw, "ddl", f"ALTER {ast.args.get('kind') or ''}".strip(), "high" if risky else "medium", ast,
                         target_table=ast.this.name if isinstance(ast.this, exp.Table) else None)

    if isinstance(ast, exp.Create):
        kind = str(ast.args.get("kind") or "").upper()
        if kind in {"DATABASE", "SCHEMA", "ROLE", "USER", "EXTENSION"}:
            raise PolicyError(f"CREATE {kind} is not allowed (projects are isolated databases)")
        return Statement(raw, "ddl", f"CREATE {kind}".strip(), "medium", ast)

    if isinstance(ast, exp.Grant):
        return Statement(raw, "ddl", "GRANT", "medium", ast)
    if isinstance(ast, exp.Revoke):
        return Statement(raw, "ddl", "REVOKE", "high", ast)
    if isinstance(ast, exp.Comment):
        return Statement(raw, "ddl", "COMMENT", "low", ast)

    if isinstance(ast, (exp.Transaction, exp.Commit, exp.Rollback)):
        raise PolicyError("remove BEGIN/COMMIT/ROLLBACK: Normie already runs every change in one transaction")
    if isinstance(ast, (exp.Set, exp.Use)):
        raise PolicyError("SET/USE session statements are managed by Normie")

    raise PolicyError(f"unsupported statement type: {type(ast).__name__}")


def parse(sql: str) -> list[Statement]:
    sql = (sql or "").strip()
    if not sql:
        raise PolicyError("empty SQL")
    try:
        asts = [a for a in sqlglot.parse(sql, read="postgres") if a is not None and not isinstance(a, exp.Semicolon)]
    except sqlglot.errors.ParseError as e:
        return _parse_each(sql, e)
    if not asts:
        raise PolicyError("could not parse SQL")
    # Keep the user's original text per statement when we can (better error messages, exact DDL).
    raws = _split_sql(sql) if len(asts) > 1 else [sql]
    if len(raws) != len(asts):
        raws = [a.sql(dialect="postgres") for a in asts]
    return [_classify(a, r) for a, r in zip(asts, raws)]


# Valid PostgreSQL that sqlglot cannot parse but that is harmless metadata.
UNPARSED_SAFE_PREFIXES = ("COMMENT ON",)


def _parse_each(sql: str, first_error: Exception) -> list[Statement]:
    """Fallback when the whole script fails to parse: parse statement by statement and admit only
    known-harmless statements that sqlglot cannot read (e.g. COMMENT ON CONSTRAINT ... ON t)."""
    out = []
    for raw in _split_sql(sql):
        try:
            asts = [a for a in sqlglot.parse(raw, read="postgres") if a is not None and not isinstance(a, exp.Semicolon)]
            out += [_classify(a, raw) for a in asts]
        except sqlglot.errors.ParseError as e:
            if raw.strip().upper().startswith(UNPARSED_SAFE_PREFIXES):
                out.append(Statement(raw, "ddl", "COMMENT", "low", None))
            else:
                raise PolicyError(f"syntax error: {str(e).splitlines()[0]}") from None
    if not out:
        raise PolicyError(f"syntax error: {str(first_error).splitlines()[0]}")
    return out


def _split_sql(sql: str) -> list[str]:
    """Split on top-level semicolons, respecting quotes and $$ bodies."""
    out, buf, i, n = [], [], 0, len(sql)
    quote: str | None = None
    while i < n:
        ch = sql[i]
        if quote:
            if sql.startswith(quote, i):
                buf.append(quote)
                i += len(quote)
                quote = None
                continue
            buf.append(ch)
            i += 1
            continue
        if ch in ("'", '"'):
            quote = ch
        elif ch == "$":
            j = sql.find("$", i + 1)
            tag = sql[i : j + 1] if j != -1 else ""
            if tag and (tag == "$$" or tag[1:-1].replace("_", "").isalnum()):
                quote = tag
                buf.append(tag)
                i += len(tag)
                continue
        elif ch == "-" and sql.startswith("--", i):
            j = sql.find("\n", i)
            j = n if j == -1 else j
            buf.append(sql[i:j])
            i = j
            continue
        elif ch == ";":
            stmt = "".join(buf).strip()
            if stmt and not all(l.strip().startswith("--") or not l.strip() for l in stmt.splitlines()):
                out.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    stmt = "".join(buf).strip()
    if stmt and not all(l.strip().startswith("--") or not l.strip() for l in stmt.splitlines()):
        out.append(stmt)
    return out


def single(sql: str) -> Statement:
    stmts = parse(sql)
    if len(stmts) != 1:
        raise PolicyError("exactly one statement expected (stacked statements are not allowed here)")
    return stmts[0]


def overall_risk(stmts: list[Statement]) -> Risk:
    return _max_risk(*(s.risk for s in stmts)) if stmts else "low"


def risk_for_rows(st: Statement, rows: int) -> Risk:
    """Finalise risk of a DML statement after the dry run told us how many rows it touches."""
    if st.op in ("UPDATE", "DELETE"):
        if not st.has_where or rows > 100:
            return "high"
        return "low" if rows <= 1 else "medium"
    if st.op == "INSERT":
        return "low" if rows <= 1000 else "medium"
    return st.risk
