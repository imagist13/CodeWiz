"""
Message and type definitions for the Hermes agent pipeline.

Inspired by codewiz-agent's llm/base.py message system.
Provides type-safe Message/MessageRole/ToolCall dataclasses
instead of raw dict[str, str].
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Message Role
# ---------------------------------------------------------------------------

class MessageRole(str, Enum):
    """Enumeration of valid message roles in a conversation."""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


# ---------------------------------------------------------------------------
# ToolCall — a tool call requested by the LLM
# ---------------------------------------------------------------------------

@dataclass
class ToolCall:
    """Represents a single tool call requested by the LLM.

    Mirrors codewiz-agent's ToolCall dataclass.
    """
    id: str
    name: str
    arguments: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to OpenAI function-calling format."""
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments, ensure_ascii=False),
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ToolCall":
        """Reconstruct from dict (handles both OpenAI and flat formats)."""
        func = data.get("function") or {}
        args = func.get("arguments") or data.get("arguments") or {}
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        return cls(
            id=data.get("id") or "",
            name=func.get("name") or data.get("name") or "",
            arguments=args,
        )

    def to_openai_tool_call(self) -> dict[str, Any]:
        return self.to_dict()


# ---------------------------------------------------------------------------
# Message — a single message in the conversation
# ---------------------------------------------------------------------------

@dataclass
class Message:
    """Represents a single message in a conversation.

    Mirrors codewiz-agent's Message dataclass with thinking support.
    """
    role: MessageRole
    content: str = ""
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[list[ToolCall]] = None
    thinking: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict for LLM API calls."""
        result: dict[str, Any] = {
            "role": self.role.value,
            "content": self.content,
        }
        if self.name:
            result["name"] = self.name
        if self.tool_call_id:
            result["tool_call_id"] = self.tool_call_id
        if self.tool_calls:
            result["tool_calls"] = [tc.to_dict() for tc in self.tool_calls]
        if self.thinking:
            result["thinking"] = self.thinking
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Message":
        """Reconstruct from a plain dict."""
        role_str = data.get("role", "user")
        try:
            role = MessageRole(role_str)
        except ValueError:
            role = MessageRole.USER

        tool_calls: Optional[list[ToolCall]] = None
        raw_tcs = data.get("tool_calls")
        if raw_tcs:
            tool_calls = [ToolCall.from_dict(tc) for tc in raw_tcs]

        return cls(
            role=role,
            content=data.get("content") or "",
            name=data.get("name"),
            tool_call_id=data.get("tool_call_id"),
            tool_calls=tool_calls,
            thinking=data.get("thinking"),
        )

    @classmethod
    def system(cls, content: str) -> "Message":
        return cls(role=MessageRole.SYSTEM, content=content)

    @classmethod
    def user(cls, content: str) -> "Message":
        return cls(role=MessageRole.USER, content=content)

    @classmethod
    def assistant(cls, content: str = "", tool_calls: Optional[list[ToolCall]] = None,
                  thinking: Optional[str] = None) -> "Message":
        return cls(role=MessageRole.ASSISTANT, content=content,
                   tool_calls=tool_calls, thinking=thinking)

    @classmethod
    def tool(cls, content: str, tool_call_id: str, name: Optional[str] = None) -> "Message":
        return cls(role=MessageRole.TOOL, content=content,
                   tool_call_id=tool_call_id, name=name)

    def is_tool(self) -> bool:
        return self.role == MessageRole.TOOL

    def is_assistant(self) -> bool:
        return self.role == MessageRole.ASSISTANT

    def has_tool_calls(self) -> bool:
        return bool(self.tool_calls)


# ---------------------------------------------------------------------------
# LLMResponse — response from the LLM provider
# ---------------------------------------------------------------------------

@dataclass
class LLMResponse:
    """Represents a response from an LLM call."""
    content: Optional[str] = None
    thinking: Optional[str] = None
    tool_calls: Optional[list[ToolCall]] = None
    finish_reason: Optional[str] = None
    usage: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "thinking": self.thinking,
            "tool_calls": [tc.to_dict() for tc in self.tool_calls] if self.tool_calls else None,
            "finish_reason": self.finish_reason,
            "usage": self.usage,
        }


# ---------------------------------------------------------------------------
# Helpers for converting legacy dict messages to Message objects
# ---------------------------------------------------------------------------

def dict_to_message(d: dict[str, Any]) -> Message:
    """Convert a legacy plain-dict message to a Message object."""
    return Message.from_dict(d)


def messages_to_dicts(msgs: list[Message]) -> list[dict[str, Any]]:
    """Convert a list of Message objects to plain dicts (for LLM APIs)."""
    return [m.to_dict() for m in msgs]


def dicts_to_messages(dicts: list[dict[str, Any]]) -> list[Message]:
    """Convert a list of plain dicts to Message objects."""
    return [Message.from_dict(d) for d in dicts]
