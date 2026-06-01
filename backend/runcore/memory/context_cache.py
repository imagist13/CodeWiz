"""In-memory context cache with TTL — ported from yszen-ai."""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from langchain_core.messages import BaseMessage

CACHE_TTL_SECONDS = 3600  # 1 hour


class ContextCache:
    """Process-level cache for conversation history, avoiding repeated DB reads."""

    def __init__(self):
        self._store: Dict[str, dict] = {}

    def get(self, session_id: str) -> Optional[dict]:
        entry = self._store.get(session_id)
        if not entry:
            return None
        if time.time() > entry["expires_at"]:
            self._store.pop(session_id, None)
            return None
        return {
            "messages": entry["messages"],
            "summary": entry.get("summary"),
        }

    def set(self, session_id: str, messages: List[BaseMessage], summary: Optional[str] = None):
        self._store[session_id] = {
            "messages": messages,
            "summary": summary,
            "expires_at": time.time() + CACHE_TTL_SECONDS,
        }

    def append_message(self, session_id: str, message: BaseMessage):
        entry = self._store.get(session_id)
        if entry:
            entry["messages"].append(message)
            entry["expires_at"] = time.time() + CACHE_TTL_SECONDS

    def clear(self, session_id: str):
        self._store.pop(session_id, None)

    def get_raw(self, session_id: str) -> Optional[dict]:
        entry = self._store.get(session_id)
        if not entry:
            return None
        if time.time() > entry["expires_at"]:
            self._store.pop(session_id, None)
            return None
        return entry


context_cache = ContextCache()
