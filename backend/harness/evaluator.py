"""Evaluator — 多维度评分引擎"""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class CodeQualityScore:
    lint_pass: bool
    test_pass: bool
    file_written: int


@dataclass
class FlowComplianceScore:
    has_clarification: bool
    has_plan_review: bool
    has_human_approval: bool


@dataclass
class ResourceMetrics:
    total_tokens: int
    total_cost_usd: float
    total_time_ms: int
    tool_call_count: int


@dataclass
class ObservabilityScore:
    has_token_log: bool
    has_latency_log: bool
    has_cost_breakdown: bool


@dataclass
class EvalResult:
    code_quality: CodeQualityScore
    flow_compliance: FlowComplianceScore
    resource: ResourceMetrics
    observability: ObservabilityScore


class Evaluator:
    """评测引擎 — 基于事件流计算多维度评分"""

    def evaluate(self, events: list[dict]) -> EvalResult:
        tool_calls = [e for e in events if e.get("type") == "tool_call"]
        usages = [e for e in events if e.get("type") == "usage"]
        total_tokens = sum(u.get("total_tokens", 0) for u in usages)

        # Code Quality
        lint_pass = any(
            e.get("type") == "lint_result" and e.get("passed")
            for e in events
        )
        test_pass = any(
            e.get("type") == "test_result" and e.get("passed")
            for e in events
        )
        file_written = sum(
            1 for e in tool_calls
            if e.get("name") == "conduit_write_code" and e.get("success")
        )

        # Flow Compliance
        has_clarification = any(e.get("type") == "clarify_complete" for e in events)
        has_plan_review = any(e.get("type") == "plan_approved" for e in events)
        has_human_approval = any(
            e.get("type") in ("plan_approved", "verify_pass")
            for e in events
        )

        # Resource
        total_ms = sum(e.get("elapsed_ms", 0) for e in tool_calls)

        # Observability
        has_token_log = all(u.get("total_tokens") for u in usages)
        has_latency_log = all(e.get("elapsed_ms") for e in tool_calls)

        return EvalResult(
            code_quality=CodeQualityScore(
                lint_pass=lint_pass,
                test_pass=test_pass,
                file_written=file_written,
            ),
            flow_compliance=FlowComplianceScore(
                has_clarification=has_clarification,
                has_plan_review=has_plan_review,
                has_human_approval=has_human_approval,
            ),
            resource=ResourceMetrics(
                total_tokens=total_tokens,
                total_cost_usd=total_tokens * 0.000001,  # 估算
                total_time_ms=total_ms,
                tool_call_count=len(tool_calls),
            ),
            observability=ObservabilityScore(
                has_token_log=has_token_log,
                has_latency_log=has_latency_log,
                has_cost_breakdown=bool(usages),
            ),
        )

    def to_dict(self, result: EvalResult) -> dict:
        return {
            "code_quality": {
                "lint_pass": result.code_quality.lint_pass,
                "test_pass": result.code_quality.test_pass,
                "file_written": result.code_quality.file_written,
            },
            "flow_compliance": {
                "has_clarification": result.flow_compliance.has_clarification,
                "has_plan_review": result.flow_compliance.has_plan_review,
                "has_human_approval": result.flow_compliance.has_human_approval,
            },
            "resource": {
                "total_tokens": result.resource.total_tokens,
                "total_cost_usd": result.resource.total_cost_usd,
                "total_time_ms": result.resource.total_time_ms,
                "tool_call_count": result.resource.tool_call_count,
            },
            "observability": {
                "has_token_log": result.observability.has_token_log,
                "has_latency_log": result.observability.has_latency_log,
                "has_cost_breakdown": result.observability.has_cost_breakdown,
            },
        }
