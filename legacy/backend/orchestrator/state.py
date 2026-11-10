from __future__ import annotations
import uuid
from typing import Any, Literal
from pydantic import BaseModel, Field


class ToolResult(BaseModel):
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None
    audit_id: str = Field(default_factory=lambda: str(uuid.uuid4()))


StageType = Literal["design", "schema", "security", "deployed", "evolving"]


class ProjectState(BaseModel):
    project_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stage: StageType = "design"
    requirements_text: str = ""
    er_model: dict[str, Any] = Field(default_factory=lambda: {"entities": [], "relationships": []})
    relational_schema: dict[str, Any] = Field(default_factory=lambda: {"tables": [], "fds": []})
    roles: list[dict[str, Any]] = Field(default_factory=list)
    ddl_version: int = 1
    pending_approvals: list[dict[str, Any]] = Field(default_factory=list)
