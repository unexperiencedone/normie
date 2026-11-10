from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import sqlglot
from sqlglot import exp


DENIED_FUNCTIONS = {
    "pg_sleep",
    "dblink",
    "dblink_exec",
    "pg_read_file",
    "pg_write_file",
    "pg_ls_dir",
    "copy",
    "lo_import",
    "lo_export",
    "lo_open",
    "system",
}


@dataclass
class RoleSchemaContext:
    role_name: str
    allowed_statements: list[str]  # e.g. ["SELECT", "INSERT"]
    visible_tables: set[str]  # e.g. {"student", "enrollment"}
    visible_columns: dict[str, set[str]] | None = None  # table -> set of allowed cols


@dataclass
class ValidationResult:
    ok: bool
    sanitized_sql: str | None = None
    reason: str | None = None
    statement_type: str | None = None


def validate_sql(
    sql: str,
    role_context: RoleSchemaContext | None = None,
    default_limit: int = 1000,
) -> ValidationResult:
    """Validate and sanitize SQL statement using sqlglot AST parsing.
    Enforces security policies:
      - Reject multiple/stacked statements
      - Enforce statement type allow-list
      - Enforce WHERE clause on UPDATE/DELETE
      - Block denied functions (pg_sleep, dblink, etc.)
      - Verify table and column visibility against role context
      - Inject LIMIT if missing on SELECT
    """
    cleaned_sql = sql.strip()
    if not cleaned_sql:
        return ValidationResult(ok=False, reason="Empty SQL query.")

    try:
        expressions = sqlglot.parse(cleaned_sql, read="postgres")
    except Exception as e:
        return ValidationResult(ok=False, reason=f"SQL syntax error: {str(e)}")

    if not expressions:
        return ValidationResult(ok=False, reason="Could not parse SQL.")

    if len(expressions) > 1:
        return ValidationResult(ok=False, reason="Stacked statements are strictly forbidden.")

    ast = expressions[0]

    # Statement type check
    stmt_type = ast.key.upper()
    if role_context and stmt_type not in [s.upper() for s in role_context.allowed_statements]:
        return ValidationResult(
            ok=False,
            reason=f"Role '{role_context.role_name}' is not authorized to execute {stmt_type} statements.",
            statement_type=stmt_type,
        )

    # Function deny-list check
    for func in ast.find_all(exp.Anonymous, exp.Func):
        func_name = func.this if isinstance(func.this, str) else func.key
        if func_name.lower() in DENIED_FUNCTIONS:
            return ValidationResult(
                ok=False,
                reason=f"Use of restricted database function '{func_name}' is forbidden.",
                statement_type=stmt_type,
            )

    # WHERE clause check for UPDATE and DELETE
    if isinstance(ast, (exp.Update, exp.Delete)):
        if not ast.find(exp.Where):
            return ValidationResult(
                ok=False,
                reason=f"{stmt_type} statement must include a WHERE clause for safety.",
                statement_type=stmt_type,
            )

    # Role schema visibility check
    if role_context:
        for table in ast.find_all(exp.Table):
            table_name = table.name.lower()
            if table_name and role_context.visible_tables and table_name not in role_context.visible_tables:
                return ValidationResult(
                    ok=False,
                    reason=f"Table '{table_name}' is not accessible to role '{role_context.role_name}'.",
                    statement_type=stmt_type,
                )

        if role_context.visible_columns:
            for col in ast.find_all(exp.Column):
                col_name = col.name.lower()
                table_name = col.table.lower() if col.table else None
                if table_name and table_name in role_context.visible_columns:
                    if col_name not in role_context.visible_columns[table_name]:
                        return ValidationResult(
                            ok=False,
                            reason=f"Column '{col_name}' on table '{table_name}' is not accessible to role '{role_context.role_name}'.",
                            statement_type=stmt_type,
                        )

    # Inject LIMIT on SELECT if not already present
    if isinstance(ast, exp.Select):
        if not ast.find(exp.Limit):
            ast = ast.limit(default_limit)

    sanitized = ast.sql(dialect="postgres")
    return ValidationResult(
        ok=True,
        sanitized_sql=sanitized,
        statement_type=stmt_type,
    )
