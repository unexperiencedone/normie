from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from backend.tools.sql.validator import RoleSchemaContext, validate_sql


@dataclass
class SimulationResult:
    allowed: bool
    reason: str
    sanitized_sql: str | None = None


def simulate_access(
    role_name: str,
    sql: str,
    allowed_statements: list[str],
    visible_tables: set[str],
    visible_columns: dict[str, set[str]] | None = None,
) -> SimulationResult:
    """Simulate and verify whether a given SQL statement is permitted for a specific role
    before deploying permissions to PostgreSQL."""
    role_context = RoleSchemaContext(
        role_name=role_name,
        allowed_statements=allowed_statements,
        visible_tables=visible_tables,
        visible_columns=visible_columns,
    )
    val = validate_sql(sql, role_context=role_context)
    if val.ok:
        return SimulationResult(
            allowed=True,
            reason=f"Statement is authorized for role '{role_name}'.",
            sanitized_sql=val.sanitized_sql,
        )
    return SimulationResult(
        allowed=False,
        reason=val.reason or f"Statement rejected for role '{role_name}'.",
    )
