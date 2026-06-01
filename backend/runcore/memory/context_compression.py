"""Context compression — ported from yszen-ai.

Automatically summarizes conversation history when token budget is exceeded,
preserving a running summary instead of a growing message list.

Flow:
  should_compress() → compress() → saves summary to DB → rebuild_messages()
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage

from runcore.memory.context_cache import context_cache

log = logging.getLogger(__name__)

# Default: 128K context window (MiniMax-Text-01 supports 1M, use 128K as safe default)
DEFAULT_CONTEXT_WINDOW_K = 128

COMPRESSION_PROMPT_TEMPLATE = """You are a text summarizer. Your task is to produce a concise but comprehensive summary
of a conversation between a user and an AI assistant.

## Instructions
1. READ the entire previous summary and new conversation carefully
2. MERGE: add new facts, decisions, and context from the new conversation to the previous summary
3. PRESERVE: keep all important facts, constraints, and decisions from the previous summary
4. UPDATE: if the new conversation contradicts or refines something in the previous summary, use the newer version
5. FORMAT: pure plain text, no markdown, no bullet points, no prefixes, no role labels
6. LENGTH: aim for 200-500 words; condense long passages while keeping key information
7. DEDUPLICATE: if the same topic appears in both sources, keep only the most detailed version

{previous_summary_section}
## New Conversation
{conversation}

## Output
Produce ONLY the refined summary text. No commentary, no "here is the summary", just the text."""

_LastSummary: dict[str, str] = {}  # session_id → summary content


def count_tokens(messages: List[BaseMessage]) -> int:
    """Rough token estimate: 4 chars per token."""
    return sum(len(msg.content or '') // 4 for msg in messages)


def should_compress(messages: List[BaseMessage], threshold_ratio: float = 0.8, context_window_k: float = DEFAULT_CONTEXT_WINDOW_K) -> bool:
    """Return True if total tokens exceed threshold_ratio of context window."""
    total_k = count_tokens(messages) / 1000
    return total_k >= (context_window_k * threshold_ratio)


def split_messages(messages: List[BaseMessage], protected_rounds: int = 0) -> Tuple[List[BaseMessage], List[BaseMessage]]:
    """Split messages into compressible and protected portions.

    Protected rounds keep the last N user messages (and their responses) intact.
    """
    if protected_rounds == 0:
        return messages, []

    user_indices = [i for i, msg in enumerate(messages) if isinstance(msg, HumanMessage)]
    if len(user_indices) <= protected_rounds:
        return [], messages

    split_idx = user_indices[-protected_rounds]
    compressible = messages[:split_idx]
    protected = messages[split_idx:]
    return compressible, protected


def _build_compression_prompt(compressible_messages: List[BaseMessage], previous_summary: str = '') -> str:
    """Build the prompt for the summarization LLM."""
    conversation_lines = []

    for msg in compressible_messages:
        if isinstance(msg, SystemMessage):
            content = msg.content or ''
            # Extract previous summary from SystemMessage prefix
            if content.startswith("Previous conversation summary: "):
                # Avoid double-wrapping if already processed
                if not previous_summary:
                    previous_summary = content[len("Previous conversation summary: "):]
        elif isinstance(msg, HumanMessage):
            conversation_lines.append(f"User: {msg.content}")
        elif isinstance(msg, AIMessage):
            # Strip think tags for cleaner compression input
            content = msg.content or ''
            content = re.sub(r'<think>[\s\S]*?</think>', '', content)
            conversation_lines.append(f"Assistant: {content}")
        elif isinstance(msg, ToolMessage):
            conversation_lines.append(f"Tool result: {msg.content}")

    conversation = "\n\n".join(conversation_lines)

    prev_section = ""
    if previous_summary:
        prev_section = f"## Previous Summary\n{previous_summary}\n\n"

    return COMPRESSION_PROMPT_TEMPLATE.format(
        previous_summary_section=prev_section,
        conversation=conversation
    )


async def generate_summary(
    compressible_messages: List[BaseMessage],
    user_id: str,
) -> str:
    """Use the LLM to generate a summary of the compressible messages."""
    try:
        from runcore.llm import create_provider
        from core.config import load_user_config

        config = load_user_config(user_id)
        provider_type = config.get('provider', 'minimax')

        api_key = _get_api_key(config, provider_type)
        model = _get_model(config, provider_type)
        base_url = _get_base_url(config, provider_type)

        if not api_key:
            log.warning("No API key for compression, skipping summary")
            return ""

        provider = create_provider(provider_type, api_key, model, base_url=base_url)

        previous_summary = ""
        for msg in compressible_messages:
            if isinstance(msg, SystemMessage):
                content = msg.content or ''
                if content.startswith("Previous conversation summary: "):
                    previous_summary = content[len("Previous conversation summary: "):]
                    break

        prompt = _build_compression_prompt(compressible_messages, previous_summary)

        response = await provider.chat_complete(
            [{"role": "user", "content": prompt}],
            tools=None,
        )

        summary = response.content or ""
        summary = summary.strip()
        summary = re.sub(r'<think>[\s\S]*?</think>', '', summary, flags=re.DOTALL)
        summary = re.sub(r'\[system\]|\[user\]|\[assistant\]', '', summary)
        return summary.strip()

    except Exception as e:
        log.warning(f"Summary generation failed: {e}")
        return previous_summary


def _get_api_key(config: dict, provider: str) -> str:
    if provider == 'minimax':
        return config.get('minimax_api_key', '') or config.get('api_key', '')
    elif provider == 'deepseek':
        return config.get('deepseek_api_key', '') or config.get('api_key', '')
    elif provider == 'anthropic':
        return config.get('anthropic_api_key', '') or config.get('api_key', '')
    return config.get('api_key', '')


def _get_model(config: dict, provider: str) -> str:
    if provider == 'minimax':
        return config.get('minimax_model', '') or 'MiniMax-Text-01'
    elif provider == 'deepseek':
        return config.get('deepseek_model', '') or 'deepseek-chat'
    elif provider == 'anthropic':
        return config.get('anthropic_model', '') or 'claude-sonnet-4-20250514'
    return config.get('model', 'gpt-4o')


def _get_base_url(config: dict, provider: str) -> str | None:
    if provider == 'minimax':
        return config.get('minimax_base_url') or 'https://api.minimax.chat/v1'
    elif provider == 'deepseek':
        return config.get('deepseek_base_url') or 'https://api.deepseek.com'
    elif provider == 'anthropic':
        return None
    return config.get('base_url')


def save_summary_to_db(conversation_id: str, user_id: str, summary: str, message_count_before: int) -> None:
    """Persist summary to the Conversation record via sync aiosqlite."""
    import aiosqlite
    import asyncio
    from paths import get_data_dir
    import os

    db_path = os.path.join(get_data_dir(), 'hermes.db')

    async def _save():
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            now = datetime.utcnow().isoformat()
            # Upsert conversation summary
            await db.execute(
                "UPDATE conversations SET summary = ?, updated_at = ? WHERE id = ?",
                (summary, now, conversation_id)
            )
            await db.commit()

    try:
        asyncio.get_event_loop().run_until_complete(_save())
    except RuntimeError:
        asyncio.run(_save())


def rebuild_messages(summary: str, protected_messages: List[BaseMessage]) -> List[BaseMessage]:
    """Rebuild the message list: SystemMessage(summary) + protected tail."""
    summary_msg = SystemMessage(content=f"Previous conversation summary: {summary}")
    return [summary_msg] + protected_messages


async def compress(
    messages: List[BaseMessage],
    conversation_id: str,
    user_id: str,
    protected_rounds: int = 2,
) -> List[BaseMessage]:
    """Compress messages: summarize the oldest portion, keep recent ones.

    Args:
        messages: full message history
        conversation_id: for DB persistence
        user_id: for LLM config
        protected_rounds: number of recent user-message rounds to keep intact

    Returns:
        New message list with a summary in place of old messages.
    """
    global _LastSummary

    compressible, protected = split_messages(messages, protected_rounds)
    if not compressible:
        return messages

    summary = await generate_summary(compressible, user_id)
    _LastSummary[conversation_id] = summary

    if summary:
        save_summary_to_db(conversation_id, user_id, summary, len(compressible))

    return rebuild_messages(summary, protected)


def get_last_summary(conversation_id: str) -> Optional[str]:
    """Get the most recently generated summary for a conversation."""
    return _LastSummary.get(conversation_id)
