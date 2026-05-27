"""LLM 客户端契约。

agents/* 全部依赖 LLMClient Protocol 而非具体 ArkClient，
方便 (a) 测试时塞 FakeLLM, (b) 等队友 ark_client.py 完成后无侵入接入。

v3 Task 10: 加 ToolCall 模型 + LLMResponse.tool_calls 字段 +
LLMClient.chat 接 tools= 参数, 支持 OpenAI function-calling 协议。
"""

from __future__ import annotations

import json
from typing import Protocol, List, Dict, Any, Optional

from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    """OpenAI tool-calling 协议下 assistant 返回的工具调用。

    协议形态 (OpenAI / DeepSeek / 豆包统一):
      {"id": "call_xxx", "type": "function",
       "function": {"name": "...", "arguments": "<json-string>"}}
    """

    id: str
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_openai(cls, raw: Dict[str, Any]) -> "ToolCall":
        fn = raw.get("function", {})
        args = fn.get("arguments", {})
        # OpenAI 返字符串, 某些封装直接返 dict, 两种都接
        if isinstance(args, str):
            if args.strip():
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            else:
                args = {}
        if not isinstance(args, dict):
            args = {}
        return cls(id=raw["id"], name=fn.get("name", ""), arguments=args)

    def to_openai(self) -> Dict[str, Any]:
        """回灌 messages[].tool_calls 字段使用。"""
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments, ensure_ascii=False),
            },
        }


class LLMResponse(BaseModel):
    content: str
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    latency_ms: int = Field(ge=0)
    cost_cny: float = Field(ge=0.0)
    reasoning_content: str = ""
    reasoning_tokens: int = Field(default=0, ge=0)
    # v3 Task 10: tool-calling 协议下的工具调用列表 (空 = 模型选择直接出 content)
    tool_calls: List[ToolCall] = Field(default_factory=list)


class LLMClient(Protocol):
    async def chat(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.0,
        max_tokens: int = 2048,
        tools: Optional[List[Dict[str, Any]]] = None,
        **metadata: Any,  # skill_name / prompt_key / step_id 等 observability 元数据
    ) -> LLMResponse: ...


class FakeLLM:
    """测试用 LLM。按顺序吐 canned 响应，并记录所有调用。

    canned 元素:
      - str: 仅 content
      - dict: 含 content / reasoning_content / reasoning_tokens / tool_calls
              tool_calls 元素可以是 ToolCall 实例 或 dict (id/name/arguments)
    """

    def __init__(self, canned: List[Any]):
        self._canned = list(canned)
        self._cursor = 0
        self.calls: List[Dict[str, Any]] = []

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.0,
        max_tokens: int = 2048,
        tools: Optional[List[Dict[str, Any]]] = None,
        **metadata: Any,
    ) -> LLMResponse:
        self.calls.append(
            {
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "tools": tools,
                **metadata,
            }
        )
        item = self._canned[self._cursor]
        self._cursor += 1
        if isinstance(item, str):
            content, reasoning, reasoning_tokens = item, "", 0
            tool_calls: List[ToolCall] = []
        else:
            content = item.get("content", "")
            reasoning = item.get("reasoning_content", "")
            reasoning_tokens = item.get("reasoning_tokens", 0)
            raw_tcs = item.get("tool_calls", []) or []
            tool_calls = []
            for tc in raw_tcs:
                if isinstance(tc, ToolCall):
                    tool_calls.append(tc)
                elif isinstance(tc, dict):
                    # 支持 {id,name,arguments} 简写 + 完整 OpenAI 格式
                    if "function" in tc:
                        tool_calls.append(ToolCall.from_openai(tc))
                    else:
                        tool_calls.append(ToolCall(**tc))
        return LLMResponse(
            content=content,
            tokens_in=len(str(messages)),
            tokens_out=len(content),
            latency_ms=10,
            cost_cny=0.0001,
            reasoning_content=reasoning,
            reasoning_tokens=reasoning_tokens,
            tool_calls=tool_calls,
        )
