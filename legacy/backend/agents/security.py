from __future__ import annotations
import json
from typing import Any
from backend.llm.base import LLM
from backend.orchestrator.state import ProjectState, ToolResult
from backend.tools.security.simulator import simulate_access


class SecurityAgent:
    def __init__(self, llm: LLM):
        self.llm = llm

    async def run(
        self,
        state: ProjectState,
        role_description: str = "",
    ) -> tuple[ProjectState, ToolResult]:
        """Generate role permissions, secure views, and verify via access simulation."""
        tables = [t.get("name") for t in state.relational_schema.get("tables", [])]
        system_prompt = (
            "You are the DBForge Security Agent. Generate role policies from description. "
            "Output JSON with: name, description, allowed_statements (e.g. ['SELECT']), "
            "visible_tables (list of strings), visible_columns (dict of table -> list of columns)."
        )

        llm_res = await self.llm.complete(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Available tables: {tables}. Role requirement: {role_description}"},
            ]
        )

        try:
            # Fallback mock role if JSON parsing doesn't match
            try:
                role_def = json.loads(llm_res.content)
            except Exception:
                role_def = {
                    "name": "staff",
                    "description": role_description or "General staff role",
                    "allowed_statements": ["SELECT"],
                    "visible_tables": tables[:2] if tables else ["patient"],
                    "visible_columns": {},
                }

            role_name = role_def.get("name", "custom_role")
            allowed_stmts = role_def.get("allowed_statements", ["SELECT"])
            vis_tables = set(role_def.get("visible_tables", tables))
            vis_cols = {t: set(cols) for t, cols in role_def.get("visible_columns", {}).items()}

            # Generate PostgreSQL View SQL and GRANT statements
            view_sqls = []
            grant_sqls = [f"CREATE ROLE t_{state.tenant_id}_{role_name};"]

            for tbl in vis_tables:
                cols = vis_cols.get(tbl)
                col_clause = ", ".join(cols) if cols else "*"
                view_name = f"v_{role_name}_{tbl}"
                view_sqls.append(f"CREATE OR REPLACE VIEW {view_name} AS SELECT {col_clause} FROM {tbl};")
                grant_sqls.append(f"GRANT SELECT ON {view_name} TO t_{state.tenant_id}_{role_name};")

            # Simulate access verification
            sample_sql = f"SELECT * FROM {list(vis_tables)[0]}" if vis_tables else "SELECT 1"
            sim = simulate_access(
                role_name=role_name,
                sql=sample_sql,
                allowed_statements=allowed_stmts,
                visible_tables=vis_tables,
                visible_columns=vis_cols if vis_cols else None,
            )

            role_record = {
                "name": role_name,
                "description": role_def.get("description", ""),
                "allowed_statements": allowed_stmts,
                "visible_tables": sorted(list(vis_tables)),
                "views": view_sqls,
                "grants": grant_sqls,
                "verified": sim.allowed,
            }

            state.roles.append(role_record)
            state.stage = "security"

            return state, ToolResult(
                ok=True,
                data={
                    "role": role_record,
                    "simulation": {"allowed": sim.allowed, "reason": sim.reason},
                },
            )
        except Exception as e:
            return state, ToolResult(
                ok=False,
                error=f"Security Agent error: {str(e)}",
            )
