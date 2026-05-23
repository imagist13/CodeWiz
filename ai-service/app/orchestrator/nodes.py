"""LangGraph 节点函数。

每个节点签名: async def node_*(state: OrchestratorState, deps: NodeDeps) -> dict
返回 dict 是 LangGraph 增量 update (会自动 merge 进 state)。

step_executor 节点单独在 graph.py 里以循环子图实现, 不放这里。
verify 节点也在 graph.py 里 (调 bash 跑 lint/test, 用 verify_fixer 修复)。
pr_creator 暂用 mock URL, 等 mcp-server-github 接入后替换。
"""

from dataclasses import dataclass
from typing import Any

from app.codemap.scanner import CodeMap
from app.skills.registry import SkillRegistry
from app.agents.skill_router import SkillRouter
from app.agents.slot_check import SlotChecker
from app.agents.clarify_reflexion import ClarifyReflexion
from app.orchestrator.state import OrchestratorState


@dataclass
class NodeDeps:
    registry: SkillRegistry
    codemap: CodeMap
    llm: Any  # LLMClient


async def node_clarify(state: OrchestratorState, deps: NodeDeps) -> dict:
    """Reflexion 澄清: 输出 understanding + questions"""
    clarify = ClarifyReflexion(deps.llm)
    result = await clarify.clarify(state["raw_intent"])
    return {
        "reflexion_critique": result.understanding,
        "pending_questions": list(result.questions),
    }


async def node_router(state: OrchestratorState, deps: NodeDeps) -> dict:
    """Skill 路由"""
    router = SkillRouter(deps.registry)
    result = router.route(state["raw_intent"])
    return {
        "matched_skill": result.top1.skill_name,
        "skill_confidence": result.top1.confidence,
    }


async def node_slot_check(state: OrchestratorState, deps: NodeDeps) -> dict:
    """槽位检查 + 默认值填充, 追加问题到 pending_questions"""
    skill = deps.registry.business(state["matched_skill"])
    checker = SlotChecker()
    result = checker.check(skill, state["pm_answers"])
    return {
        "filled_params": result.filled,
        "pending_questions": list(state["pending_questions"]) + list(result.questions),
    }


async def node_plan_builder(state: OrchestratorState, deps: NodeDeps) -> dict:
    """Skill.plan() 展开成 step dict 列表"""
    skill = deps.registry.business(state["matched_skill"])
    steps = skill.plan(state["filled_params"])
    return {"plan_steps": [s.model_dump() for s in steps]}


async def node_pr_creator(state: OrchestratorState, deps: NodeDeps) -> dict:
    """提 PR — MVP 暂用 mock URL, 等 mcp-server-github 接入后替换"""
    branch = state["branch_name"]
    skill = state["matched_skill"]
    return {
        "pr_url": f"https://github.com/codewiz-bot/conduit/pull/mock-{skill}?branch={branch}",
    }
