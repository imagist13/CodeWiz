"""LLM Provider base classes and dataclasses."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Optional


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]
    result: Optional[str] = None


@dataclass
class LLMResponse:
    content: Optional[str] = None
    thinking: Optional[str] = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: Optional[dict[str, Any]] = None
    finish_reason: Optional[str] = None


class LLMProvider(ABC):
    """Abstract base for all LLM providers."""

    def __init__(self, api_key: str, model: str, **kwargs):
        self.api_key = api_key
        self.model = model
        self.kwargs = kwargs

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict]] = None,
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Stream response chunks. Yields JSON-serialized event strings."""
        ...

    @abstractmethod
    async def chat_complete(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict]] = None,
    ) -> LLMResponse:
        """Non-streaming complete response."""
        ...

    def get_last_tool_calls(self) -> list[dict[str, Any]]:
        """Return tool calls extracted from the last chat() call."""
        return []
