from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.agent.runner import stream_turn
from backend.api.deps import User, chat_limiter, current_user, project_for
from backend.core import db
from backend.services.executor import jsonable

router = APIRouter(prefix="/projects/{project_id}", tags=["chat"])


class ChatReq(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)
    conversation_id: uuid.UUID | None = None


@router.get("/conversations")
async def conversations(project: dict = Depends(project_for), user: User = Depends(current_user)):
    rows = await db.control().fetch(
        """SELECT conversation_id, title, updated_at FROM conversations
           WHERE project_id=$1 AND user_id=$2 ORDER BY updated_at DESC LIMIT 50""", project["project_id"], user.id)
    return [jsonable(dict(r)) for r in rows]


@router.get("/conversations/{cid}")
async def conversation(cid: uuid.UUID, project: dict = Depends(project_for), user: User = Depends(current_user)):
    row = await db.control().fetchrow(
        """SELECT conversation_id, title, transcript, updated_at FROM conversations
           WHERE conversation_id=$1 AND project_id=$2 AND user_id=$3""", cid, project["project_id"], user.id)
    if not row:
        raise HTTPException(404, "conversation not found")
    return jsonable(dict(row))


@router.delete("/conversations/{cid}")
async def delete_conversation(cid: uuid.UUID, project: dict = Depends(project_for), user: User = Depends(current_user)):
    await db.control().execute("DELETE FROM conversations WHERE conversation_id=$1 AND project_id=$2 AND user_id=$3",
                               cid, project["project_id"], user.id)
    return {"ok": True}


_RUNNING: set[asyncio.Task] = set()  # strong refs so detached runs are not garbage-collected


@router.post("/chat")
async def chat(body: ChatReq, project: dict = Depends(project_for), user: User = Depends(current_user)):
    chat_limiter.check(str(user.id))
    queue: asyncio.Queue = asyncio.Queue()

    async def produce():
        # Runs to completion even if the browser disconnects (refresh, closed tab), so the
        # transcript/history is always persisted and no half-finished run is left behind.
        try:
            async for ev in stream_turn(project, user.id, body.conversation_id, body.message):
                queue.put_nowait(ev)
        except Exception as e:  # pragma: no cover
            queue.put_nowait({"type": "error", "message": str(e)})
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(produce())
    _RUNNING.add(task)
    task.add_done_callback(_RUNNING.discard)

    async def sse():
        while True:
            try:
                ev = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                yield ": keepalive\n\n"  # SSE comment: keeps proxies from closing an idle stream
                continue
            if ev is None:
                break
            yield f"data: {json.dumps(ev, default=str)}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})
