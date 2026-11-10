from enum import StrEnum
from typing import TypedDict

class Phase(StrEnum):
  REQUIREMENTS = "requirements"
  CLARIFYING = "clarifying"
  ER_DRAFT = "er_draft"
  ER_REVIEW = "er_review"
  SCHEMA_READY = "schema_ready"

class DesignState(TypedDict):
    # Who owns this database project?
    tenant_id: str
    project_id: str
    workflow_run_id: str

    #Where is the agent in its workflow?
    phase: str

    # What does the user want to build?
    requirements_text: str
    questions: list[str]
    answers: dict[str, str]

    # What has the agent created so far?
    er_model: dict | None

    # Why did it make that ER-model proposal?
    assumptions: list[str]
    rationale: list[str]

    # Is the graph waiting for the user?
    approval_needed: bool
    revision_feedback: str

def make_initial_state(
   tenant_id: str,
   project_id: str,
   workflow_run_id: str,
   requirements_text: str,
) -> DesignState:
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "workflow_run_id": workflow_run_id,
        "phase": Phase.REQUIREMENTS.value,
        "requirements_text": requirements_text,
        "questions": [],
        "answers": {},
        "er_model": None,
        "assumptions": [],
        "rationale": [],
        "approval_needed": False,
        "revision_feedback": "",
    }

  