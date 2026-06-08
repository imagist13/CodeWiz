import asyncio
from typing import AsyncGenerator
from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class EventType(str, Enum):
    THINK_START = "think_start"
    THINK_CHUNK = "think_chunk"
    THINK_END = "think_end"
    TOOL_START = "tool_start"
    TOOL_INPUT = "tool_input"
    TOOL_OUTPUT = "tool_output"
    TOOL_END = "tool_end"
    MESSAGE_START = "message_start"
    MESSAGE_CHUNK = "message_chunk"
    MESSAGE_END = "message_end"
    CONTEXT_INFO = "context_info"
    SKILL_ACTIVATED = "skill_activated"
    ERROR = "error"


class HarnessEvent(BaseModel):
    type: EventType
    data: dict = {}
    timestamp: str = ""

    def model_post_init(self, __context):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()


class EventBus:
    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._closed = False

    async def publish(self, event: HarnessEvent):
        if not self._closed:
            await self._queue.put(event)

    async def subscribe(self) -> AsyncGenerator[HarnessEvent, None]:
        while True:
            try:
                event = await asyncio.wait_for(self._queue.get(), timeout=300)
                yield event
                if event.type in (EventType.MESSAGE_END, EventType.ERROR):
                    break
            except asyncio.TimeoutError:
                yield HarnessEvent(type=EventType.ERROR, data={"message": "Stream timeout"})
                break

    def close(self):
        self._closed = True
