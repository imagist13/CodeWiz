"""单 Step 执行管线: codemap → readFile → prompt → LLM → diff → 落地 → 记账。

失败重试策略 (spec §4.1 L1 自愈):
  - DiffParseError / DiffApplyError: 同 prompt 加错误信息重试 1 次
  - ResolveError: 立即失败 (CodeMap 找不到符号, 重试也没用)
  - LLMClient 抛异常: 由 LLMRecorder 已记账, 重试逻辑暂留未来 (spec L4)
"""

import re
from pathlib import Path
from typing import Optional
from pydantic import BaseModel

from app.codemap.scanner import CodeMap
from app.skills.dsl import Step
from app.harness.codemap_resolver import CodeMapResolver, ResolveError
from app.harness.prompt_builder import PromptBuilder
from app.harness.diff_apply import (
    parse_diff,
    apply_diff,
    DiffParseError,
    DiffApplyError,
)


_DIFF_NEW_PATH_RE = re.compile(r"^\+\+\+ b/(.+)$", re.MULTILINE)


def _extract_target_path_from_diff(diff: str) -> Optional[str]:
    """从 unified diff 头部解析 +++ b/<path>, 返回相对路径或 None"""
    m = _DIFF_NEW_PATH_RE.search(diff)
    if m:
        return m.group(1).strip()
    return None


class StepExecutionResult(BaseModel):
    step_id: str
    status: str  # succeeded | failed
    target_path: Optional[str] = None
    diff: Optional[str] = None
    retries: int = 0
    error: Optional[str] = None


class StepExecutor:
    def __init__(
        self,
        *,
        codemap: CodeMap,
        llm,
        sandbox_root: str,
        max_retries: int = 1,
    ):
        self._resolver = CodeMapResolver(codemap)
        self._prompt = PromptBuilder()
        self._llm = llm
        self._sandbox = Path(sandbox_root)
        self._max_retries = max_retries

    async def execute(self, step: Step) -> StepExecutionResult:
        # 1. 解析目标路径 — 失败立即返回
        try:
            resolved = self._resolver.resolve(step)
        except ResolveError as e:
            return StepExecutionResult(
                step_id=step.step_id,
                status="failed",
                error=f"codemap resolve: {e}",
            )

        target_file = self._sandbox / resolved.target_path

        # 2. 读源文件 (新文件 step 允许不存在)
        if target_file.exists() and target_file.is_file():
            source = target_file.read_text()
        else:
            source = ""

        # 3-5. prompt → LLM → diff: 最多 max_retries+1 次
        last_err: Optional[str] = None
        last_diff: Optional[str] = None
        for attempt in range(self._max_retries + 1):
            messages = self._prompt.build(resolved, source=source)
            if last_err is not None:
                messages[1]["content"] += (
                    f"\n\n上次输出存在问题: {last_err}\n请修正后重新输出 diff。"
                )

            response = await self._llm.chat(
                messages,
                skill_name=resolved.dsl.get("__skill__"),
                prompt_key=resolved.prompt_template,
                step_id=resolved.step_id,
            )
            diff_text = response.content
            last_diff = diff_text

            try:
                parse_diff(diff_text)  # 语法校验
                new_content = apply_diff(diff_text, source)
            except (DiffParseError, DiffApplyError) as e:
                last_err = f"{type(e).__name__}: {e}"
                continue

            # 6. 新文件 step: 从 diff 头解析真实文件名
            parsed_path: Optional[str] = None
            if resolved.is_new_file:
                parsed_path = _extract_target_path_from_diff(diff_text)
                if parsed_path is None:
                    last_err = "new file step but diff has no +++ b/<path> header"
                    continue
                target_file = self._sandbox / parsed_path

            # 7. 落地
            target_file.parent.mkdir(parents=True, exist_ok=True)
            target_file.write_text(new_content)

            return StepExecutionResult(
                step_id=step.step_id,
                status="succeeded",
                target_path=parsed_path
                if resolved.is_new_file
                else resolved.target_path,
                diff=diff_text,
                retries=attempt,
            )

        return StepExecutionResult(
            step_id=step.step_id,
            status="failed",
            target_path=resolved.target_path,
            diff=last_diff,
            retries=self._max_retries,
            error=last_err or "unknown",
        )
