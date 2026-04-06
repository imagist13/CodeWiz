"""
Silicon Flow LLM Client
"""
import json
import httpx
from typing import AsyncIterator, List, Dict, Any, Optional
from app.core.config import get_settings

settings = get_settings()


class SiliconFlowClient:
    def __init__(self):
        self.api_url = settings.silicon_flow_api_url
        self.api_key = settings.silicon_flow_api_key
        self.model = settings.llm_model

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict[str, Any]]] = None,
        stream: bool = True,
        **kwargs
    ) -> AsyncIterator[str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
        }
        if tools:
            payload["tools"] = tools
        payload.update(kwargs)

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{settings.silicon_flow_api_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            ) as response:
                if response.status_code != 200:
                    error_text = await response.text()
                    raise Exception(f"Silicon Flow API error: {error_text}")

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        yield data_str
