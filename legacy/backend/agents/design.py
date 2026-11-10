from __future__ import annotations
import json
from typing import Any
from backend.llm.base import LLM
from backend.orchestrator.state import ProjectState, ToolResult
from backend.tools.er.models import ERModel
from backend.tools.er.validator import validate_er
from backend.tools.er.mermaid import render_mermaid


DESIGN_PROMPT = """You are the DBForge Design Agent, an expert database architect.
Your job is to analyze the user's domain description and produce a formal Entity-Relationship (ER) model.
You must extract:
- Entities (with all attributes, data types, and designate primary key is_pk: true)
- Relationships with cardinalities ("1:1", "1:N", "M:N") and participation ("total" or "partial")
- Weak entities if any (with owner_entity, identifying_relationship, and partial_keys)
- Generalizations/ISA hierarchies if applicable

Output MUST be valid JSON conforming to the ERModel schema:
{
  "entities": [...],
  "relationships": [...],
  "generalizations": [...]
}
"""


class DesignAgent:
    def __init__(self, llm: LLM):
        self.llm = llm

    async def run(self, state: ProjectState, user_input: str = "") -> tuple[ProjectState, ToolResult]:
        prompt = user_input or state.requirements_text
        messages = [
            {"role": "system", "content": DESIGN_PROMPT},
            {"role": "user", "content": f"Requirements: {prompt}"},
        ]

        llm_res = await self.llm.complete(messages)
        try:
            # Parse response as ERModel
            parsed = json.loads(llm_res.content)
            er_model = ERModel.from_dict(parsed)
            ok, errors = validate_er(er_model)
            if not ok:
                return state, ToolResult(
                    ok=False,
                    error=f"Generated ER model failed validation: {'; '.join(errors)}",
                )

            mermaid_diagram = render_mermaid(er_model)
            state.er_model = parsed
            state.stage = "design"
            return state, ToolResult(
                ok=True,
                data={
                    "er_model": parsed,
                    "mermaid": mermaid_diagram,
                    "message": "ER model successfully generated and validated.",
                },
            )
        except Exception as e:
            return state, ToolResult(
                ok=False,
                error=f"Design Agent could not process model: {str(e)}",
            )
