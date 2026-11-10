from __future__ import annotations
from typing import Any
from backend.llm.base import LLM
from backend.orchestrator.state import ProjectState, ToolResult
from backend.tools.er.models import ERModel
from backend.tools.fd.closure import candidate_keys
from backend.tools.fd.models import FD
from backend.tools.mapping.ddl import generate_ddl
from backend.tools.mapping.er_to_relational import er_to_relational
from backend.tools.normalization.checker import check_normal_form
from backend.tools.normalization.chase import is_lossless
from backend.tools.normalization.decompose import decompose_3nf, decompose_bcnf
from backend.tools.normalization.preservation import preserves_dependencies


class SchemaAgent:
    def __init__(self, llm: LLM):
        self.llm = llm

    async def run(self, state: ProjectState, custom_fds: list[dict[str, Any]] | None = None) -> tuple[ProjectState, ToolResult]:
        try:
            er_model = ERModel.from_dict(state.er_model)
            rel_schema = er_to_relational(er_model)

            # Map FDs: from custom FDs or derive natural FDs from table primary keys
            table_fds_map: dict[str, list[FD]] = {}
            if custom_fds:
                parsed_fds = [FD.from_dict(d) for d in custom_fds]
                # Associate FDs with respective tables
                for table in rel_schema.tables:
                    t_cols = set(table.column_names())
                    matching = [f for f in parsed_fds if f.lhs.issubset(t_cols)]
                    table_fds_map[table.name] = matching
            else:
                for table in rel_schema.tables:
                    if table.primary_key:
                        pk_set = frozenset(table.primary_key)
                        all_other = frozenset(set(table.column_names()) - pk_set)
                        if all_other:
                            table_fds_map[table.name] = [FD(pk_set, all_other)]
                        else:
                            table_fds_map[table.name] = []
                    else:
                        table_fds_map[table.name] = []

            # Perform Normal Form analysis on each table
            nf_reports = {}
            decompositions = {}
            for table in rel_schema.tables:
                t_cols = set(table.column_names())
                t_fds = table_fds_map.get(table.name, [])
                rep = check_normal_form(t_cols, t_fds)
                nf_reports[table.name] = rep.to_dict()

                # If violations exist, compute 3NF and BCNF decompositions
                if rep.violations:
                    decomp_3nf = decompose_3nf(t_cols, t_fds)
                    decomp_bcnf = decompose_bcnf(t_cols, t_fds)
                    is_3nf_lossless, _, _ = is_lossless(t_cols, decomp_3nf, t_fds)
                    is_3nf_dep_pres, _ = preserves_dependencies(t_cols, decomp_3nf, t_fds)
                    is_bcnf_lossless, _, _ = is_lossless(t_cols, decomp_bcnf, t_fds)

                    decompositions[table.name] = {
                        "3nf": [sorted(list(p)) for p in decomp_3nf],
                        "3nf_lossless": is_3nf_lossless,
                        "3nf_preserves_dependencies": is_3nf_dep_pres,
                        "bcnf": [sorted(list(p)) for p in decomp_bcnf],
                        "bcnf_lossless": is_bcnf_lossless,
                    }

            ddl = generate_ddl(rel_schema)
            state.relational_schema = {
                "tables": [t.model_dump() for t in rel_schema.tables],
                "fds": custom_fds or [],
            }
            state.stage = "schema"

            return state, ToolResult(
                ok=True,
                data={
                    "tables": [t.name for t in rel_schema.tables],
                    "normal_form_reports": nf_reports,
                    "decompositions": decompositions,
                    "ddl": ddl,
                },
            )
        except Exception as e:
            return state, ToolResult(
                ok=False,
                error=f"Schema Agent error: {str(e)}",
            )
