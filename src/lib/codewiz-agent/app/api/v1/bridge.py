"""
Bridge API endpoints for embedding codewiz-agent into WizAI/CodeWiz.

These endpoints allow the TypeScript runtime to call the FastAPI agent without
JWT auth (auth is handled by the TypeScript layer / Next.js API route).
"""

import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.agent import AgentService
from app.services.event_bus import EventBus
from app.db.database import get_connection

router = APIRouter()
agent_service = AgentService()


class AgentChatRequest(BaseModel):
    message: str
    session_id: str


def _ensure_session(session_id: str, user_id: str = "codewiz") -> None:
    """Auto-create the session in the FastAPI DB if it doesn't exist."""
    import uuid
    from datetime import datetime

    conn = get_connection()
    cursor = conn.cursor()

    # Disable FK checks for embedded mode (virtual "codewiz" user is not in the DB)
    cursor.execute("PRAGMA foreign_keys = OFF")

    # Ensure virtual user exists
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO users (id, email, hashed_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, f"{user_id}@codewiz.local", "", datetime.utcnow().isoformat(), datetime.utcnow().isoformat())
        )

    cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
    if not cursor.fetchone():
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO sessions (id, title, mode, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, "New Session", "agent", user_id, now, now)
        )
        conn.commit()
    conn.close()


@router.post("/chat/{session_id}/stream")
async def agent_chat_stream(session_id: str, request: AgentChatRequest):
    """
    Non-authenticated SSE chat endpoint for embedding.
    The TypeScript runtime passes CodeWiz session IDs; the agent stores
    its own messages in the FastAPI DB under that session_id.
    """
    if session_id != request.session_id:
        raise HTTPException(status_code=400, detail="Session ID mismatch")

    # Auto-create session in FastAPI DB so agent can run
    _ensure_session(session_id)

    event_bus = EventBus()

    async def event_generator():
        agent_task = asyncio.create_task(
            agent_service.run(session_id, request.message, event_bus)
        )

        try:
            async for event in event_bus.subscribe():
                data = event.model_dump_json()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            if not agent_task.done():
                agent_task.cancel()
                try:
                    await agent_task
                except asyncio.CancelledError:
                    pass
            raise
        else:
            if not agent_task.done():
                try:
                    await agent_task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
