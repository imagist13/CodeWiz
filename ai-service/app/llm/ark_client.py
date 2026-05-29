"""ArkClient — 火山方舟豆包 OpenAI 兼容 API 的 LLMClient 实现。

被 LLMRecorder.wrap() 包装后即可用于 agents/* 业务代码。

v3 Task 10:
- chat() 加 tools= 参数 + 解析 message.tool_calls
- 加 classmethod from_env(): 统一 smoke/integration 入口, 支持 DeepSeek 切换
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional

import httpx

from app.agents.llm_protocol import LLMResponse, ToolCall


DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

# 豆包 1.5-pro-32k 估算定价（元/千 tokens）。EP 切到其他模型时按公布价位调整。
INPUT_PRICE_PER_1K = 0.0008
OUTPUT_PRICE_PER_1K = 0.002


class ArkClient:
    def __init__(
        self,
        *,
        api_key: str,
        endpoint_id: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ):
        self._api_key = api_key
        self._endpoint_id = endpoint_id
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._timeout = timeout
        self._transport = transport

    @classmethod
    def from_env(cls) -> "ArkClient":
        """从环境变量构建 (smoke / integration 测试统一入口).

        Required:
          ARK_API_KEY   — 火山方舟 / DeepSeek API key
          ARK_ENDPOINT  — 豆包 EP id 或 DeepSeek 模型名 (如 deepseek-chat)
        Optional:
          ARK_BASE_URL  — 切 DeepSeek 时设 https://api.deepseek.com
        """
        api_key = os.environ.get("ARK_API_KEY")
        endpoint_id = os.environ.get("ARK_ENDPOINT")
        base_url = os.environ.get("ARK_BASE_URL")
        if not api_key or not endpoint_id:
            raise RuntimeError(
                "ARK_API_KEY / ARK_ENDPOINT must be set; "
                "see scripts/env.sh.example for reference"
            )
        kwargs: Dict[str, Any] = {"api_key": api_key, "endpoint_id": endpoint_id}
        if base_url:
            kwargs["base_url"] = base_url
        return cls(**kwargs)

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.0,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        **metadata: Any,
    ) -> LLMResponse:
        body: Dict[str, Any] = {
            "model": self._endpoint_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools is not None:
            body["tools"] = tools
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        started = time.monotonic()
        async with httpx.AsyncClient(
            timeout=self._timeout, transport=self._transport
        ) as client:
            resp = await client.post(self._url, json=body, headers=headers)
            resp.raise_for_status()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        data = resp.json()
        message = data["choices"][0]["message"]
        usage = data.get("usage", {})
        tokens_in = int(usage.get("prompt_tokens", 0))
        tokens_out = int(usage.get("completion_tokens", 0))
        reasoning_tokens = int(
            usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0)
        )
        raw_tool_calls = message.get("tool_calls") or []
        tool_calls = [ToolCall.from_openai(tc) for tc in raw_tool_calls]
        return LLMResponse(
            content=message.get("content", "") or "",
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=elapsed_ms,
            cost_cny=tokens_in / 1000 * INPUT_PRICE_PER_1K
            + tokens_out / 1000 * OUTPUT_PRICE_PER_1K,
            reasoning_content=message.get("reasoning_content", "") or "",
            reasoning_tokens=reasoning_tokens,
            tool_calls=tool_calls,
        )
