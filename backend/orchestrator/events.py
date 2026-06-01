"""PipelineEventEmitter — SSE 事件发射器"""

import json
import asyncio
from typing import Any, Generator


class PipelineEventEmitter:
    """Pipeline 事件发射器 — 生成 SSE 兼容的 dict 事件"""

    @staticmethod
    def text_chunk(content: str) -> dict:
        return {"type": "text_chunk", "content": content}

    @staticmethod
    def thinking_chunk(content: str) -> dict:
        return {"type": "thinking_chunk", "content": content}

    @staticmethod
    def thinking_done() -> dict:
        return {"type": "thinking_done"}

    @staticmethod
    def text_done() -> dict:
        return {"type": "text_done"}

    @staticmethod
    def tool_call(name: str, args: dict, result: str, success: bool, elapsed_ms: int) -> dict:
        return {
            "type": "tool_call",
            "name": name,
            "args": args,
            "result": result[:500] if isinstance(result, str) else str(result),
            "success": success,
            "elapsed_ms": elapsed_ms,
        }

    @staticmethod
    def usage(prompt_tokens: int, completion_tokens: int, total_tokens: int) -> dict:
        return {
            "type": "usage",
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }

    @staticmethod
    def error(content: str) -> dict:
        return {"type": "error", "content": content}

    @staticmethod
    def done() -> dict:
        return {"type": "done"}

    @staticmethod
    def phase_changed(phase: str, status: str) -> dict:
        return {"type": "phase_changed", "phase": phase, "status": status}

    @staticmethod
    def clarify_question(question: dict) -> dict:
        return {"type": "clarify_question", "question": question}

    @staticmethod
    def clarify_complete(requirement: dict) -> dict:
        return {"type": "clarify_complete", "requirement": requirement}

    @staticmethod
    def plan_proposed(steps: list) -> dict:
        return {"type": "plan_proposed", "steps": steps}

    @staticmethod
    def plan_approved() -> dict:
        return {"type": "plan_approved"}

    @staticmethod
    def plan_revised(feedback: str) -> dict:
        return {"type": "plan_revised", "feedback": feedback}

    @staticmethod
    def checkpoint_saved(index: int, event_seq: int) -> dict:
        return {"type": "checkpoint_saved", "index": index, "event_seq": event_seq}

    @staticmethod
    def checkpoint_restored(index: int) -> dict:
        return {"type": "checkpoint_restored", "index": index}

    @staticmethod
    def lint_result(passed: bool, issues: int) -> dict:
        return {"type": "lint_result", "passed": passed, "issues": issues}

    @staticmethod
    def test_result(passed: bool, passed_count: int, failed_count: int) -> dict:
        return {"type": "test_result", "passed": passed, "passed_count": passed_count, "failed_count": failed_count}

    @staticmethod
    def verify_pass() -> dict:
        return {"type": "verify_pass"}

    @staticmethod
    def verify_fail(reason: str) -> dict:
        return {"type": "verify_fail", "reason": reason}

    @staticmethod
    def pr_created(url: str) -> dict:
        return {"type": "pr_created", "url": url}

    @staticmethod
    def max_rounds() -> dict:
        return {"type": "max_rounds"}

    @staticmethod
    def to_sse(event: dict) -> str:
        """将事件 dict 转为 SSE 格式字符串"""
        return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
