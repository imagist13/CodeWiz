import asyncio

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.agent import AgentService
from app.services.event_bus import EventBus
from app.core.security import get_current_user
from app.api.v1.sessions import _check_session_owner

router = APIRouter()
agent_service = AgentService()


class ChatRequest(BaseModel):
    message: str


@router.post("/{session_id}/stream")
async def chat_stream(session_id: str, request: ChatRequest, current_user: dict = Depends(get_current_user)):
    _check_session_owner(session_id, current_user["id"])

    event_bus = EventBus()

    async def event_generator():
        agent_task = asyncio.create_task(agent_service.run(session_id, request.message, event_bus))

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
            "X-Accel-Buffering": "no"
        }
    )
