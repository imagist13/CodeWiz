"""ArkClient 真 API 冒烟脚本。

用法：
    ARK_API_KEY=ark-xxx ARK_ENDPOINT=ep-xxx .venv/bin/python scripts/smoke_ark.py

不在 CI 跑，只手动验证 key + endpoint + 网络 + 响应结构。
"""

from __future__ import annotations

import asyncio
import os
import sys

from app.llm.ark_client import ArkClient


async def main() -> int:
    api_key = os.environ.get("ARK_API_KEY")
    endpoint = os.environ.get("ARK_ENDPOINT")
    if not api_key or not endpoint:
        print("ERROR: set ARK_API_KEY and ARK_ENDPOINT env vars", file=sys.stderr)
        return 2

    client = ArkClient(api_key=api_key, endpoint_id=endpoint)
    print(f"==> calling Ark {endpoint} ...")
    resp = await client.chat(
        messages=[
            {"role": "system", "content": "你是一个简洁的助手，只用一句话回答。"},
            {"role": "user", "content": "用一句话介绍 CodeWiz-PMA 是什么。"},
        ],
        temperature=0.2,
        max_tokens=200,
    )
    print("--- response ---")
    print(f"content:    {resp.content!r}")
    print(f"tokens_in:  {resp.tokens_in}")
    print(f"tokens_out: {resp.tokens_out}")
    print(f"latency_ms: {resp.latency_ms}")
    print(f"cost_cny:   {resp.cost_cny:.6f}")
    print("==> OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
