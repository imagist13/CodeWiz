"""Session management — stores conversation history and session state.

Mirrors the TypeScript conversation-registry.ts and db.ts pattern.
Each Python process holds in-memory sessions, mapped by session ID.
The Node.js parent manages long-lived sessions across Python invocations.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Message:
    role: str  # "user" | "assistant" | "tool"
    content: str
    tool_call_id: str | None = None
    tool_name: str | None = None
    tool_input: dict | None = None
    name: str | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "tool_call_id": self.tool_call_id,
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "name": self.name,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Message:
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            role=data["role"],
            content=data.get("content", ""),
            tool_call_id=data.get("tool_call_id"),
            tool_name=data.get("tool_name"),
            tool_input=data.get("tool_input"),
            name=data.get("name"),
            created_at=data.get("created_at", time.time()),
        )

    def to_api_format(self) -> dict[str, Any]:
        """Format for Anthropic/OpenAI API messages list."""
        if self.role == "tool":
            return {
                "role": "tool",
                "content": self.content,
                "tool_call_id": self.tool_call_id,
            }
        elif self.role == "user":
            return {"role": "user", "content": self.content}
        elif self.role == "assistant":
            return {"role": "assistant", "content": self.content}
        else:
            return {"role": "system", "content": self.content}


@dataclass
class Session:
    id: str
    model: str
    system_prompt: str | None = None
    messages: list[Message] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    interrupted: bool = False

    def add_user_message(self, content: str) -> Message:
        msg = Message(role="user", content=content)
        self.messages.append(msg)
        self.updated_at = time.time()
        return msg

    def add_assistant_message(self, content: str) -> Message:
        msg = Message(role="assistant", content=content)
        self.messages.append(msg)
        self.updated_at = time.time()
        return msg

    def add_tool_result(
        self,
        tool_call_id: str,
        tool_name: str,
        tool_input: dict,
        content: str,
    ) -> Message:
        msg = Message(
            role="tool",
            content=content,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            tool_input=tool_input,
        )
        self.messages.append(msg)
        self.updated_at = time.time()
        return msg

    def to_api_messages(self) -> list[dict[str, Any]]:
        return [m.to_api_format() for m in self.messages]

    def interrupt(self) -> None:
        self.interrupted = True

    def clear_interrupted(self) -> None:
        self.interrupted = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "model": self.model,
            "system_prompt": self.system_prompt,
            "messages": [m.to_dict() for m in self.messages],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "interrupted": self.interrupted,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Session:
        return cls(
            id=data["id"],
            model=data.get("model", ""),
            system_prompt=data.get("system_prompt"),
            messages=[Message.from_dict(m) for m in data.get("messages", [])],
            created_at=data.get("created_at", time.time()),
            updated_at=data.get("updated_at", time.time()),
            interrupted=data.get("interrupted", False),
        )


class SessionRegistry:
    """In-memory session store. One registry per Python process lifetime."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def create(
        self,
        session_id: str,
        model: str,
        system_prompt: str | None = None,
    ) -> Session:
        session = Session(id=session_id, model=model, system_prompt=system_prompt)
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def get_or_create(
        self,
        session_id: str,
        model: str,
        system_prompt: str | None = None,
    ) -> Session:
        if session_id in self._sessions:
            return self._sessions[session_id]
        return self.create(session_id, model, system_prompt)

    def delete(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    def list_ids(self) -> list[str]:
        return list(self._sessions.keys())

    def clear(self) -> None:
        self._sessions.clear()


# Global registry instance
_registry: SessionRegistry = SessionRegistry()


def get_session(session_id: str) -> Session | None:
    return _registry.get(session_id)


def get_or_create_session(
    session_id: str,
    model: str,
    system_prompt: str | None = None,
) -> Session:
    return _registry.get_or_create(session_id, model, system_prompt)


def delete_session(session_id: str) -> bool:
    return _registry.delete(session_id)


def list_sessions() -> list[str]:
    return _registry.list_ids()


def clear_all_sessions() -> None:
    _registry.clear()
