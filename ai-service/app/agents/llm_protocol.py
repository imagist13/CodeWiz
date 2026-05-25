"""LLM 客户端契约。

agents/* 全部依赖 LLMClient Protocol 而非具体 ArkClient，
方便 (a) 测试时塞 FakeLLM, (b) 等队友 ark_client.py 完成后无侵入接入。
"""

from typing import Protocol, List, Dict, Any
from pydantic import BaseModel, Field


class LLMResponse(BaseModel):
    content: str
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    latency_ms: int = Field(ge=0)
    cost_cny: float = Field(ge=0.0)
    reasoning_content: str = ""
    reasoning_tokens: int = Field(default=0, ge=0)


class LLMClient(Protocol):
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        max_tokens: int = 2048,
        **metadata: Any,  # skill_name / prompt_key / step_id 等 observability 元数据
    ) -> LLMResponse: ...


class FakeLLM:
    """测试用 LLM。按顺序吐 canned 响应，并记录所有调用。

    canned 元素可为 str（仅 content）或 dict（含 content/reasoning_content/reasoning_tokens）。
    """

    def __init__(self, canned: List[Any]):
        self._canned = list(canned)
        self._cursor = 0
        self.calls: List[Dict[str, Any]] = []

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        max_tokens: int = 2048,
        **metadata: Any,
    ) -> LLMResponse:
        self.calls.append(
            {
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                **metadata,
            }
        )
        item = self._canned[self._cursor]
        self._cursor += 1
        if isinstance(item, str):
            content, reasoning, reasoning_tokens = item, "", 0
        else:
            content = item["content"]
            reasoning = item.get("reasoning_content", "")
            reasoning_tokens = item.get("reasoning_tokens", 0)
        return LLMResponse(
            content=content,
            tokens_in=len(str(messages)),
            tokens_out=len(content),
            latency_ms=10,
            cost_cny=0.0001,
            reasoning_content=reasoning,
            reasoning_tokens=reasoning_tokens,
        )
