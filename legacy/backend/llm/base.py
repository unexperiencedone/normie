from __future__ import annotations
from typing import Any, Protocol, runtime_checkable
from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any]
    call_id: str | None = None


class LLMResult(BaseModel):
    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = "mock"


@runtime_checkable
class LLM(Protocol):
    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        schema: type[BaseModel] | dict[str, Any] | None = None,
    ) -> LLMResult:
        """Complete a conversation prompt, optionally using tool calling or structured output."""
        ...
