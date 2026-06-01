"""Context management for conversations — loads history, applies compression, saves messages.

Ported from yszen-ai context management pattern:
  1. Load from DB (with cache)
  2. Check compression threshold → compress if needed
  3. Save new messages back to DB
  4. Provide LangChain message list to the agent
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import List, Optional

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage

from runcore.memory.context_cache import context_cache
from runcore.memory.context_compression import (
    compress, should_compress, count_tokens,
    get_last_summary, save_summary_to_db,
)

log = logging.getLogger(__name__)


def _messages_to_langchain(rows: List[dict]) -> List[BaseMessage]:
    """Convert DB rows to LangChain BaseMessage objects."""
    messages = []
    for row in rows:
        role = row.get('role', 'user')
        content = row.get('content', '') or ''
        tool_calls = row.get('tool_calls')
        tool_call_id = row.get('tool_call_id', '')
        thinking = row.get('thinking')

        if role == 'system':
            messages.append(SystemMessage(content=content))
        elif role == 'user':
            messages.append(HumanMessage(content=content))
        elif role == 'assistant':
            kwargs = {}
            if thinking:
                kwargs['additional_kwargs'] = {'reasoning_content': thinking}
            if tool_calls:
                kwargs['tool_calls'] = tool_calls
            messages.append(AIMessage(content=content, **kwargs))
        elif role == 'tool':
            messages.append(ToolMessage(content=content, tool_call_id=tool_call_id))
    return messages


async def _load_history_from_db(conversation_id: str, username: str) -> List[BaseMessage]:
    """Load message history from SQLite DB for a conversation (fully async)."""
    try:
        import aiosqlite
        from paths import get_data_dir
        import os

        db_path = os.path.join(get_data_dir(), 'hermes.db')

        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            # Get conversation to check for existing summary
            cursor = await db.execute(
                "SELECT summary FROM conversations WHERE id = ?", (conversation_id,)
            )
            row = await cursor.fetchone()
            summary_text = row['summary'] if row else None

            # Load all messages after the summary timestamp (if any)
            if summary_text:
                cursor = await db.execute(
                    "SELECT * FROM messages WHERE conversation_id = ? AND created_at > (SELECT updated_at FROM conversations WHERE id = ?) ORDER BY created_at ASC",
                    (conversation_id, conversation_id)
                )
            else:
                cursor = await db.execute(
                    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
                    (conversation_id,)
                )
            rows = await cursor.fetchall()

        messages = _messages_to_langchain([dict(r) for r in rows])

        # Prepend summary as a SystemMessage if one exists
        if summary_text:
            messages.insert(0, SystemMessage(content=f"Previous conversation summary: {summary_text}"))

        return messages

    except Exception as e:
        log.warning(f"Failed to load history from DB: {e}")
        return []


async def _save_message_to_db(
    conversation_id: str,
    username: str,
    role: str,
    content: str,
    tool_calls: Optional[list] = None,
    tool_call_id: Optional[str] = None,
    thinking: Optional[str] = None,
) -> None:
    """Save a single message to the SQLite DB."""
    try:
        import aiosqlite
        from paths import get_data_dir
        import os

        db_path = os.path.join(get_data_dir(), 'hermes.db')
        msg_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        import json
        tool_calls_json = json.dumps(tool_calls) if tool_calls else None

        async with aiosqlite.connect(db_path) as db:
            await db.execute(
                """INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (msg_id, conversation_id, role, content, tool_calls_json, tool_call_id, now)
            )
            await db.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id)
            )
            await db.commit()
    except Exception as e:
        log.warning(f"Failed to save message to DB: {e}")


async def load_conversation_context(
    conversation_id: str,
    username: str,
    max_tokens_before_compress: int = 50_000,
) -> List[BaseMessage]:
    """Load conversation history, checking cache first, then DB (fully async).

    If the total token count exceeds max_tokens_before_compress, applies
    context compression before returning.
    """
    # Check in-memory cache first
    cached = context_cache.get(conversation_id)
    if cached:
        messages = cached['messages']
        if not should_compress(messages, threshold_ratio=0.8, context_window_k=max_tokens_before_compress / 1000):
            return messages
        # Cache exists but needs compression — fall through to recompress
        log.info(f"Cache exists for {conversation_id} but needs compression, recomputing...")

    # Load from DB (async)
    messages = await _load_history_from_db(conversation_id, username)

    if not messages:
        return messages

    # Check if compression is needed
    if should_compress(messages, threshold_ratio=0.8, context_window_k=max_tokens_before_compress / 1000):
        log.info(f"Context exceeds {max_tokens_before_compress} tokens, compressing...")
        try:
            messages = await compress(messages, conversation_id, username, protected_rounds=2)
        except Exception as e:
            log.warning(f"Compression failed: {e}, using uncompressed history")

    # Cache the result
    context_cache.set(conversation_id, messages, summary=get_last_summary(conversation_id))
    return messages


async def save_messages_to_db(
    conversation_id: str,
    username: str,
    messages: List[BaseMessage],
) -> None:
    """Save a list of LangChain messages to the DB."""
    for msg in messages:
        role = 'user'
        content = ''
        tool_calls = None
        tool_call_id = ''
        thinking = None

        if isinstance(msg, HumanMessage):
            role = 'user'
            content = msg.content or ''
        elif isinstance(msg, AIMessage):
            role = 'assistant'
            content = msg.content or ''
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                tool_calls = msg.tool_calls
            if hasattr(msg, 'additional_kwargs'):
                thinking = msg.additional_kwargs.get('reasoning_content')
        elif isinstance(msg, ToolMessage):
            role = 'tool'
            content = msg.content or ''
            tool_call_id = msg.tool_call_id or ''
        elif isinstance(msg, SystemMessage):
            # Don't save system messages to DB
            continue

        await _save_message_to_db(
            conversation_id, username, role, content,
            tool_calls=tool_calls, tool_call_id=tool_call_id, thinking=thinking
        )
