"""Lint / Test 失败时的 LLM 修复节点。

输入：失败输出 + 最近改动 diff + 目标文件原始内容
输出：单文件 unified diff（由 step_executor 应用并重跑 lint/test）

由 LangGraph 的 verify_fixer 节点调度，最多重试 2 轮（在 orchestrator 控）。
"""

import re
from typing import List, Literal
from pydantic import BaseModel

from app.agents.llm_protocol import LLMClient


_SYSTEM = (
    "你是 JavaScript / Node.js 修复助手。"
    "给定 {{kind}} 失败输出 + 最近改动 + 当前文件内容，"
    "输出仅一个 unified diff 修复该文件。\n"
    "约束：\n"
    "  - 只输出 diff, 不解释\n"
    "  - 只改 {{target_file}} 一个文件\n"
    "  - 不要新增 dependencies\n"
    "  - 保持原代码风格"
)


class FixerRequest(BaseModel):
    kind: Literal["lint", "test"]
    failure_output: str
    recent_diffs: List[str]
    target_file: str
    original_file_content: str


class FixerResponse(BaseModel):
    fix_diff: str
    confidence: float


class VerifyFixer:
    def __init__(self, llm: LLMClient):
        self._llm = llm

    async def fix(self, req: FixerRequest) -> FixerResponse:
        system = _SYSTEM.replace("{{kind}}", req.kind).replace(
            "{{target_file}}", req.target_file
        )
        user = (
            f"失败输出:\n{req.failure_output}\n\n"
            f"最近 diff:\n"
            + "\n---\n".join(req.recent_diffs)
            + f"\n\n当前文件 ({req.target_file}):\n{req.original_file_content}"
        )
        r = await self._llm.chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.0,
        )
        fix = r.content.strip()
        confidence = self._estimate_confidence(fix)
        return FixerResponse(fix_diff=fix, confidence=confidence)

    @staticmethod
    def _estimate_confidence(diff: str) -> float:
        if not diff:
            return 0.0
        if re.search(r"^@@.*@@", diff, flags=re.MULTILINE):
            return 0.8
        if diff.startswith("---") or diff.startswith("+++"):
            return 0.6
        return 0.3
