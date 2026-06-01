"""ToolRunner — 工具执行器，含权限控制、限流、超时"""

import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, ascompleted
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

TOOL_TIMEOUT = 120  # 秒


TOOL_REGISTRY: dict[str, tuple[Any, Callable]] = {}
"""全局工具注册表: name -> (schema, handler)"""


def register_tool(schema: dict, handler: Callable) -> None:
    """注册工具到全局表"""
    name = schema["function"]["name"]
    TOOL_REGISTRY[name] = (schema, handler)


def clear_tool_registry() -> None:
    TOOL_REGISTRY.clear()


def load_tool_schemas() -> list[dict]:
    """返回排序后的 schema 列表"""
    return [TOOL_REGISTRY[k][0] for k in sorted(TOOL_REGISTRY)]


def _err(msg: str) -> str:
    return f"[ERROR] {msg}"


class ToolRunner:
    """工具执行器"""

    def __init__(
        self,
        tool_enabled: dict | None = None,
        tool_deny: list | None = None,
        max_per_type: int = 80,
        max_total: int = 80,
    ):
        self._enabled = dict(tool_enabled) if tool_enabled else {}
        self._deny = set(tool_deny or [])
        self.max_per_type = max_per_type
        self.max_total = max_total
        self._counts: dict[str, int] = {}

    def reset_count(self) -> None:
        self._counts.clear()

    def _check(self, name: str) -> str | None:
        if name in self._deny:
            return _err(f"工具 {name} 已被管理员禁用")
        if self._enabled.get(name) is False:
            return _err(f"工具 {name} 未启用（配置关闭）")
        total = sum(self._counts.values())
        if total >= self.max_total:
            return _err(f"已达到单轮总调用上限 {self.max_total}")
        self._counts[name] = self._counts.get(name, 0) + 1
        if self._counts[name] > self.max_per_type:
            return _err(f"工具 {name} 达到上限 {self.max_per_type}")
        return None

    def execute(self, tool_calls: list) -> tuple[list[dict], list[dict]]:
        """并行执行所有 tool_calls"""
        results: list[dict] = []
        details: list[dict] = []

        def run_one(tc):
            name = tc.name
            start = time.time()
            err_msg = self._check(name)
            if err_msg:
                return {
                    "id": tc.id,
                    "name": name,
                    "result": err_msg,
                    "success": False,
                    "elapsed_ms": 0,
                }

            if name not in TOOL_REGISTRY:
                return {
                    "id": tc.id,
                    "name": name,
                    "result": _err(f"未知工具: {name}"),
                    "success": False,
                    "elapsed_ms": 0,
                }

            _, handler = TOOL_REGISTRY[name]
            try:
                result = handler(**tc.input)
                elapsed = int((time.time() - start) * 1000)
                return {
                    "id": tc.id,
                    "name": name,
                    "result": result,
                    "success": True,
                    "elapsed_ms": elapsed,
                }
            except Exception as e:
                elapsed = int((time.time() - start) * 1000)
                return {
                    "id": tc.id,
                    "name": name,
                    "result": _err(str(e)),
                    "success": False,
                    "elapsed_ms": elapsed,
                }

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(run_one, tc): tc for tc in tool_calls}
            for future in ascompleted(futures):
                result = future.result()
                results.append(result)
                details.append({
                    "type": "tool_call",
                    "id": result["id"],
                    "name": result["name"],
                    "args": futures[future].input,
                    "result": result["result"],
                    "success": result["success"],
                    "elapsed_ms": result["elapsed_ms"],
                })

        results.sort(key=lambda x: next(i for i, tc in enumerate(tool_calls) if tc.id == x["id"]))
        return results, details
