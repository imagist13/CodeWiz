"""豆包 EP Provider — 接入 doubao-seed-2.0-lite"""

import json
import time
from typing import Generator

import httpx

from models.provider_schema import ToolCall, ProviderResponse
from provider.base import BaseProvider


class DoubaoProvider(BaseProvider):
    """豆包 EP (Volcano Engine) Provider"""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://ark.cn-beijing.volces.com/api/v3",
        model: str = "doubao-seed-2.0-lite",
        timeout: int = 120,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.stream = True
        self.last_response: ProviderResponse | None = None
        self.last_usage: dict | None = None

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def respond(self, messages: list[dict], tools: list[dict] | None = None) -> ProviderResponse:
        """非流式调用"""
        payload = {
            "model": self.model,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
            payload["stream"] = False

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                choice = data["choices"][0]
                msg = choice.get("message", {})

                tool_calls = []
                for tc in msg.get("tool_calls", []):
                    tool_calls.append(
                        ToolCall(
                            id=tc["id"],
                            name=tc["function"]["name"],
                            input=json.loads(tc["function"]["arguments"]),
                        )
                    )

                self.last_response = ProviderResponse(
                    text=msg.get("content", ""),
                    reasoning="",
                    tool_calls=tool_calls,
                    usage=data.get("usage"),
                    finish_reason=choice.get("finish_reason", ""),
                )
                self.last_usage = data.get("usage")
                return self.last_response

        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"HTTP {e.response.status_code}: {e.response.text}")
        except Exception as e:
            raise RuntimeError(f"Provider error: {e}")

    def respond_stream(
        self, messages: list[dict], tools: list[dict] | None = None
    ) -> Generator[dict, None, None]:
        """流式调用，yield 事件"""
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
                with client.stream("POST", f"{self.base_url}/chat/completions", headers=self._get_headers(), json=payload) as resp:
                    resp.raise_for_status()
                    full_text = ""
                    full_reasoning = ""
                    tool_calls_batch: list[ToolCall] = []
                    current_tc = None
                    finish_reason = ""

                    for line in resp.iter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        delta = chunk.get("choices", [{}])[0].get("delta", {})

                        if delta.get("reasoning_content"):
                            full_reasoning += delta["reasoning_content"]
                            yield {
                                "type": "thinking_chunk",
                                "content": delta["reasoning_content"],
                            }

                        if delta.get("content"):
                            full_text += delta["content"]
                            yield {"type": "text_chunk", "content": delta["content"]}

                        for tc_delta in delta.get("tool_calls", []):
                            idx = tc_delta.get("index", 0)
                            while len(tool_calls_batch) <= idx:
                                tool_calls_batch.append(None)
                            existing = tool_calls_batch[idx]
                            if existing is None:
                                tool_calls_batch[idx] = ToolCall(
                                    id=tc_delta.get("id", f"call_{idx}"),
                                    name=tc_delta.get("function", {}).get("name", ""),
                                    input={},
                                )
                                current_tc = tool_calls_batch[idx]
                            if tc_delta.get("function", {}).get("arguments"):
                                args_str = tc_delta["function"]["arguments"]
                                try:
                                    current_tc.input = json.loads(args_str)
                                except json.JSONDecodeError:
                                    current_tc.input = {}

                        choice = chunk.get("choices", [{}])[0]
                        finish_reason = choice.get("finish_reason", "")

                    if full_reasoning:
                        yield {"type": "thinking_done"}

                    # 构建最终 tool_calls
                    final_tcs = [tc for tc in tool_calls_batch if tc is not None]

                    self.last_response = ProviderResponse(
                        text=full_text,
                        reasoning=full_reasoning,
                        tool_calls=final_tcs,
                        usage=chunk.get("usage"),
                        finish_reason=finish_reason,
                    )
                    self.last_usage = chunk.get("usage")

        except httpx.HTTPStatusError as e:
            yield {"type": "error", "content": f"HTTP {e.response.status_code}: {e.response.text}"}
        except Exception as e:
            yield {"type": "error", "content": f"Provider error: {e}"}
