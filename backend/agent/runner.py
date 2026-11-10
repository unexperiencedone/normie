"""Runs one chat turn of the Copilot and converts PydanticAI events into browser (SSE) events.

Browser event types:
  {"type": "conversation", "id"}                      first event, the conversation id
  {"type": "thinking", "delta"}                       model reasoning (shown collapsed)
  {"type": "text", "delta"}                           answer text (Markdown)
  {"type": "tool_call", "id", "name", "args"}         the agent called a tool
  {"type": "tool_result", "id", "name", "ok", "ui"}   tool finished; `ui` = rich payload for a card
  {"type": "error", "message"} / {"type": "done"}
"""
from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ModelMessagesTypeAdapter,
    PartDeltaEvent,
    PartStartEvent,
    RetryPromptPart,
    TextPart,
    TextPartDelta,
    ThinkingPart,
    ThinkingPartDelta,
)

from backend.agent.copilot import Deps, agent, build_model, model_settings
from backend.core import db
from backend.services.executor import jsonable


async def _log(project_id, conversation_id, run_id, kind, tool=None, payload=None) -> None:
    await db.control().execute(
        """INSERT INTO agent_events (project_id, conversation_id, run_id, kind, tool, payload)
           VALUES ($1,$2,$3,$4,$5,$6)""", project_id, conversation_id, run_id, kind, tool,
        jsonable(payload) if payload is not None else None)


class Transcript:
    """Assistant turn as an ordered list of parts, mirrored to the browser and persisted."""

    def __init__(self) -> None:
        self.parts: list[dict[str, Any]] = []

    def _append_text(self, kind: str, delta: str) -> None:
        if self.parts and self.parts[-1]["type"] == kind:
            self.parts[-1]["text"] += delta
        else:
            self.parts.append({"type": kind, "text": delta})

    def text(self, d: str) -> None:
        self._append_text("text", d)

    def thinking(self, d: str) -> None:
        self._append_text("thinking", d)

    def tool_call(self, tid: str, name: str, args: dict) -> None:
        self.parts.append({"type": "tool", "id": tid, "name": name, "args": args, "status": "running"})

    def tool_result(self, tid: str, ok: bool, ui: dict | None, error: Any) -> None:
        for p in self.parts:
            if p.get("type") == "tool" and p["id"] == tid:
                p.update(status="ok" if ok else "error", ui=ui, error=error)


async def stream_turn(project: dict, user_id: uuid.UUID, conversation_id: uuid.UUID | None,
                      message: str) -> AsyncIterator[dict[str, Any]]:
    pid = project["project_id"]
    if conversation_id is None:
        conversation_id = await db.control().fetchval(
            "INSERT INTO conversations (project_id, user_id, title) VALUES ($1,$2,$3) RETURNING conversation_id",
            pid, user_id, message.strip().splitlines()[0][:80] or "New chat")
        history_json, transcript = [], []
    else:
        row = await db.control().fetchrow(
            "SELECT history, transcript FROM conversations WHERE conversation_id=$1 AND project_id=$2 AND user_id=$3",
            conversation_id, pid, user_id)
        if not row:
            yield {"type": "error", "message": "conversation not found"}
            return
        history_json, transcript = row["history"], row["transcript"]
    yield {"type": "conversation", "id": str(conversation_id)}

    history = ModelMessagesTypeAdapter.validate_python(history_json)
    deps = Deps(project_id=pid, user_id=user_id, conversation_id=conversation_id, project_name=project["name"])
    run_id = uuid.uuid4()
    turn = Transcript()
    new_history = None
    await _log(pid, conversation_id, run_id, "run_start", payload={"message": message})

    try:
        model = build_model()
        async with agent.run_stream_events(message, deps=deps, message_history=history, model=model,
                                           model_settings=model_settings()) as stream:
            async for ev in stream:
                if isinstance(ev, PartStartEvent):
                    if isinstance(ev.part, TextPart) and ev.part.content:
                        turn.text(ev.part.content)
                        yield {"type": "text", "delta": ev.part.content}
                    elif isinstance(ev.part, ThinkingPart) and ev.part.content:
                        turn.thinking(ev.part.content)
                        yield {"type": "thinking", "delta": ev.part.content}
                elif isinstance(ev, PartDeltaEvent):
                    if isinstance(ev.delta, TextPartDelta) and ev.delta.content_delta:
                        turn.text(ev.delta.content_delta)
                        yield {"type": "text", "delta": ev.delta.content_delta}
                    elif isinstance(ev.delta, ThinkingPartDelta) and ev.delta.content_delta:
                        turn.thinking(ev.delta.content_delta)
                        yield {"type": "thinking", "delta": ev.delta.content_delta}
                elif isinstance(ev, FunctionToolCallEvent):
                    p = ev.part
                    try:
                        args = p.args_as_dict()
                    except Exception:
                        args = {"raw": str(p.args)}
                    turn.tool_call(p.tool_call_id, p.tool_name, args)
                    await _log(pid, conversation_id, run_id, "tool_call", p.tool_name, args)
                    yield {"type": "tool_call", "id": p.tool_call_id, "name": p.tool_name, "args": args}
                elif isinstance(ev, FunctionToolResultEvent):
                    p = ev.part
                    if isinstance(p, RetryPromptPart):
                        ok, err, content = False, p.model_response()[:500], None
                    else:
                        content = p.content
                        ok = not (isinstance(content, dict) and content.get("ok") is False)
                        err = content.get("error") if isinstance(content, dict) and not ok else None
                    ui = deps.ui.pop(p.tool_call_id, None)
                    ui = jsonable(ui) if ui else None
                    turn.tool_result(p.tool_call_id, ok, ui, err)
                    await _log(pid, conversation_id, run_id, "tool_result", p.tool_name,
                               {"ok": ok, "error": err})
                    yield {"type": "tool_result", "id": p.tool_call_id, "name": p.tool_name, "ok": ok,
                           "ui": ui, "error": err}
                elif isinstance(ev, AgentRunResultEvent):
                    new_history = ev.result.all_messages()
    except Exception as e:  # LLM down, timeout, invalid output after retries...
        msg = f"{type(e).__name__}: {e}"
        turn.parts.append({"type": "error", "text": msg[:1000]})
        await _log(pid, conversation_id, run_id, "error", payload={"error": msg[:2000]})
        yield {"type": "error", "message": msg[:1000]}

    transcript = list(transcript) + [{"role": "user", "text": message},
                                     {"role": "assistant", "parts": turn.parts, "run_id": str(run_id)}]
    if new_history is not None:
        history_json = json.loads(ModelMessagesTypeAdapter.dump_json(new_history))
    await db.control().execute(
        "UPDATE conversations SET history=$2, transcript=$3, updated_at=now() WHERE conversation_id=$1",
        conversation_id, history_json, transcript)
    await _log(pid, conversation_id, run_id, "run_end")
    yield {"type": "done"}
