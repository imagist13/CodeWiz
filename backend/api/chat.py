"""Chat API with SSE streaming and context compression."""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from runcore.agent import StreamingAgentEngine
from runcore.engine import AgentEngine
from runcore.memory.context_manager import (
    load_conversation_context,
    save_messages_to_db,
    context_cache,
)
from runcore.context import set_user_context, clear_context, set_conversation_id

log = logging.getLogger(__name__)
router = APIRouter()

_active_sessions: dict[str, asyncio.Task] = {}

# SSE stream timeout — client gets kicked off if nothing arrives for this many seconds
_STREAM_TIMEOUT_SECONDS = 120


@router.post('/chat')
async def chat(request: Request):
    """SSE streaming chat endpoint with context compression.

    Routes to StreamingAgentEngine (async + parallel tools) by default.
    Falls back to the original AgentEngine for backward compatibility.
    """
    body = await request.json()
    message = body.get('message', '')
    conversation_id = body.get('conversation_id')
    username = body.get('username', 'default')
    use_new_engine = body.get('new_engine', True)

    if not message:
        return JSONResponse({'error': 'Empty message'}, status_code=400)

    async def event_generator(request: Request):
        engine = None
        session_id = str(uuid.uuid4())
        task: asyncio.Task | None = None

        async def _stream():
            nonlocal engine
            try:
                from core.config import load_user_config
                config = load_user_config(username)
                set_user_context(username, config)
                if conversation_id:
                    set_conversation_id(conversation_id)

                if use_new_engine:
                    engine = StreamingAgentEngine(username, config)
                else:
                    engine = AgentEngine(username, config)

                ctx_conv_id = conversation_id or f'conv_{uuid.uuid4().hex[:12]}'
                context_messages = await load_conversation_context(ctx_conv_id, username)

                for msg in context_messages:
                    role = 'user' if hasattr(msg, 'role') and msg.role == 'user' else \
                           'assistant' if hasattr(msg, 'role') and msg.role == 'assistant' else 'system'
                    if hasattr(msg, 'content') and msg.content:
                        if role == 'system' and 'Previous conversation summary:' in (msg.content or ''):
                            continue
                        engine.add_to_history(role, msg.content or '')

                event_count = 0
                async for event_str in engine.chat_stream(message, conversation_id):
                    if event_str.strip():
                        event_count += 1
                        log.info(f'SSE event {event_count}: {event_str[:120].strip()}')
                        yield {'event': 'message', 'data': event_str}

                log.info(f'SSE stream ended, total events: {event_count}')
                yield {'event': 'message', 'data': '{"event":"done","data":null}'}

            except asyncio.CancelledError:
                log.info(f'SSE session {session_id} cancelled')
                yield {'event': 'message', 'data': json.dumps({'event': 'error', 'data': 'Request cancelled'})}
                raise
            except Exception as e:
                log.exception('Chat error in SSE stream')
                yield {'event': 'message', 'data': json.dumps({'event': 'error', 'data': str(e)})}
            finally:
                clear_context()
                _active_sessions.pop(session_id, None)
                if engine and hasattr(engine, 'cleanup'):
                    try:
                        engine.cleanup()
                    except Exception:
                        pass

        try:
            _active_sessions[session_id] = asyncio.current_task()
            async for chunk in _stream():
                # Check if client disconnected before yielding
                if await request.is_disconnected():
                    log.warning(f'Client disconnected, aborting session {session_id}')
                    break
                yield chunk
        except GeneratorExit:
            log.info(f'SSE client disconnected, session {session_id} ending')

    return EventSourceResponse(event_generator(request), ping=15)
