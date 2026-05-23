"""LangGraph 全局状态 — PostgresCheckpointer 会序列化整个 dict。

设计约束:
  - 所有字段必须是 JSON 可序列化原生类型 (dict/list/str/int/float/bool/None)
  - 嵌套 pydantic 用 .model_dump() 转 dict
  - 没有 Callable / 自定义对象
"""

from typing import TypedDict, Optional, List, Literal, Dict, Any


class StepEvent(TypedDict):
    step_id: str
    status: Literal["pending", "running", "succeeded", "failed", "skipped"]
    started_at: float
    ended_at: Optional[float]
    diff: Optional[str]
    llm_calls: List[str]
    error: Optional[str]


class OrchestratorState(TypedDict):
    session_id: str
    repo_clone_path: str
    branch_name: str

    raw_intent: str
    conversation: List[Dict[str, Any]]

    reflexion_critique: Optional[str]
    pending_questions: List[str]
    pm_answers: Dict[str, Any]

    matched_skill: Optional[str]
    skill_confidence: Optional[float]
    filled_params: Dict[str, Any]
    plan_steps: List[Dict[str, Any]]  # Step.model_dump() 列表

    current_step_idx: int
    step_events: List[StepEvent]

    awaiting_gate: Optional[Literal["clarify", "plan", "pr"]]
    pr_url: Optional[str]


def new_state(
    *, session_id: str, repo_clone_path: str, branch_name: str, raw_intent: str
) -> OrchestratorState:
    return OrchestratorState(
        session_id=session_id,
        repo_clone_path=repo_clone_path,
        branch_name=branch_name,
        raw_intent=raw_intent,
        conversation=[],
        reflexion_critique=None,
        pending_questions=[],
        pm_answers={},
        matched_skill=None,
        skill_confidence=None,
        filled_params={},
        plan_steps=[],
        current_step_idx=0,
        step_events=[],
        awaiting_gate=None,
        pr_url=None,
    )
