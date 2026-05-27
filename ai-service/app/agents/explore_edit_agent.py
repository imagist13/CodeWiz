"""ExploreEditAgent — Contract-driven 自由探索式 Agent (v3 Task 11).

输入: SkillContract (goal/constraints/forbid/acceptance/candidate_symbols)
驱动: LLMClient + OpenAI tool-calling 协议 (调度平台 14 工具)
约束: policy_dispatch (denylist + bash 白名单)
验收: AcceptanceCheck.run(fs)

主循环:
  for i in range(max_iters):
    resp = llm.chat(messages, tools=schema)
    if resp.tool_calls 空:
      跑 acceptance
      全过 → ok=True 退出
      失败 → 失败明细回灌 (ACCEPTANCE_FAILURE_TEMPLATE), 继续循环
    else:
      assistant + tool_calls 入 messages
      逐个 dispatch, tool 结果回灌
      tool 失败 → TOOL_ERROR_RECOVERY_TEMPLATE 回灌
  循环超限 → 最后跑一次 acceptance, ok 取决于结果
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from app.agents.llm_protocol import LLMClient, LLMResponse
from app.agents.policy import policy_dispatch
from app.agents.prompts.explore_edit import (
    EXPLORE_EDIT_SYSTEM_PROMPT,
    CONTRACT_PROMPT_TEMPLATE,
    ACCEPTANCE_FAILURE_TEMPLATE,
    TOOL_ERROR_RECOVERY_TEMPLATE,
)
from app.skills.acceptance import AcceptanceResult
from app.skills.contract import SkillContract


# 写工具 → 哪个参数是 file path (用于 diff_files 收集)。
_WRITE_TOOLS_FILE_KEY: Dict[str, str] = {
    "writeFileTool": "file",
    "replaceInFileTool": "file",
    "appendToFileTool": "file",
}


@dataclass
class AgentRunResult:
    ok: bool
    iters: int
    acceptance: List[AcceptanceResult]
    diff_files: List[str] = field(default_factory=list)
    trace: List[Dict[str, Any]] = field(default_factory=list)


class _AcceptanceFs:
    """给 AcceptanceCheck.run() 用的轻量 fs view, 只读 + grep。

    生产里 agent 改的是沙箱里的真文件; acceptance 在同一个 root 上验证。
    """

    def __init__(self, root: Path):
        self.root = Path(root)

    def _resolve(self, path: str) -> Path:
        return self.root / path

    def read_file(self, path: str) -> str:
        p = self._resolve(path)
        if not p.is_file():
            raise FileNotFoundError(path)
        return p.read_text(encoding="utf-8", errors="ignore")

    def file_exists(self, path: str) -> bool:
        return self._resolve(path).is_file()

    def grep(self, pattern: str, path: str = ".") -> List[str]:
        rx = re.compile(pattern)
        base = self._resolve(path)
        hits: List[str] = []
        if base.is_file():
            files = [base]
        elif base.is_dir():
            files = [
                p
                for p in base.rglob("*")
                if p.is_file()
                and ".git" not in p.parts
                and "node_modules" not in p.parts
            ]
        else:
            return []
        for f in files:
            try:
                text = f.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for ln, line in enumerate(text.splitlines(), 1):
                if rx.search(line):
                    rel = f.relative_to(self.root) if f.is_absolute() else f
                    hits.append(f"{rel}:{ln}:{line}")
        return hits


def _format_contract(c: SkillContract) -> str:
    def _bullets(items: List[str]) -> str:
        return "\n".join(f"  - {x}" for x in items) if items else "  (none)"

    return CONTRACT_PROMPT_TEMPLATE.format(
        goal=c.goal,
        constraints=_bullets(c.constraints),
        forbid=_bullets(c.forbid),
        acceptance=_bullets([str(a) for a in c.acceptance]),
        candidate_symbols=_bullets(c.candidate_symbols),
    )


class ExploreEditAgent:
    def __init__(
        self,
        llm: LLMClient,
        repo_root: Any,  # str | Path
        *,
        max_iters: int = 30,
        tools_schema: Optional[List[Dict[str, Any]]] = None,
        dispatch: Optional[Callable] = None,
    ):
        self.llm = llm
        self.fs = _AcceptanceFs(Path(repo_root))
        self.max_iters = max_iters
        self.tools_schema = tools_schema
        # 默认走 policy 层 (denylist + bash 白名单)
        self.dispatch = dispatch if dispatch is not None else policy_dispatch

    async def run(self, contract: SkillContract) -> AgentRunResult:
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": EXPLORE_EDIT_SYSTEM_PROMPT},
            {"role": "user", "content": _format_contract(contract)},
        ]
        trace: List[Dict[str, Any]] = []
        diff_files: List[str] = []

        for i in range(self.max_iters):
            resp: LLMResponse = await self.llm.chat(
                messages=messages, tools=self.tools_schema
            )
            trace.append(
                {
                    "iter": i,
                    "reasoning": resp.reasoning_content,
                    "tool_calls": [tc.name for tc in resp.tool_calls],
                    "content_len": len(resp.content or ""),
                }
            )

            if not resp.tool_calls:
                # 触发 acceptance
                results = [a.run(self.fs) for a in contract.acceptance]
                if all(r.ok for r in results):
                    return AgentRunResult(
                        ok=True,
                        iters=i + 1,
                        acceptance=results,
                        diff_files=diff_files,
                        trace=trace,
                    )
                # 失败 → 回灌
                failed = "\n".join(
                    f"  - {r.check}: {r.detail}" for r in results if not r.ok
                )
                messages.append({"role": "assistant", "content": resp.content or ""})
                messages.append(
                    {
                        "role": "user",
                        "content": ACCEPTANCE_FAILURE_TEMPLATE.format(
                            failed_checks=failed
                        ),
                    }
                )
                continue

            # 有 tool_calls: 执行
            messages.append(
                {
                    "role": "assistant",
                    "content": resp.content or "",
                    "tool_calls": [tc.to_openai() for tc in resp.tool_calls],
                }
            )
            for tc in resp.tool_calls:
                tool_result = self.dispatch(tc.name, tc.id, tc.arguments)
                # diff_files 收集 (仅写工具成功时)
                if not tool_result.is_error and tc.name in _WRITE_TOOLS_FILE_KEY:
                    key = _WRITE_TOOLS_FILE_KEY[tc.name]
                    if path := tc.arguments.get(key):
                        diff_files.append(path)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tc.name,
                        "content": str(tool_result.result),
                    }
                )
                if tool_result.is_error:
                    messages.append(
                        {
                            "role": "user",
                            "content": TOOL_ERROR_RECOVERY_TEMPLATE.format(
                                tool_name=tc.name,
                                error=str(tool_result.result),
                            ),
                        }
                    )

        # 跑满 max_iters
        results = [a.run(self.fs) for a in contract.acceptance]
        return AgentRunResult(
            ok=all(r.ok for r in results),
            iters=self.max_iters,
            acceptance=results,
            diff_files=diff_files,
            trace=trace,
        )
