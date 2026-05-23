"""LangGraph StateGraph 编排。

节点流:
    START → clarify → router → slot_check →[INTERRUPT]→ plan_builder
        →[INTERRUPT]→ step_executor_loop → verify →[INTERRUPT]→ pr_creator → END

step_executor_loop 是一个循环节点: 取 state.current_step_idx 的 step 跑,
跑完 idx+1, 如果还有 step 自旋继续, 没了进 verify。
"""

import time
from typing import Any

from langgraph.graph import StateGraph, START, END

from app.codemap.scanner import scan_conduit
from app.skills.dsl import Step as DSLStep
from app.skills.registry import SkillRegistry

from app.orchestrator.state import OrchestratorState, StepEvent
from app.orchestrator.nodes import (
    NodeDeps,
    node_clarify,
    node_router,
    node_slot_check,
    node_plan_builder,
    node_pr_creator,
)
from app.harness.step_executor import StepExecutor


def build_graph(*, sandbox_root: str, llm: Any, checkpointer: Any):
    """编译 LangGraph, 注入 deps + checkpointer。"""
    registry = SkillRegistry.discover("app.skills")
    codemap = scan_conduit(sandbox_root)
    deps = NodeDeps(registry=registry, codemap=codemap, llm=llm)
    step_exe = StepExecutor(codemap=codemap, llm=llm, sandbox_root=sandbox_root)

    async def _step_loop(state: OrchestratorState) -> dict:
        """跑剩余所有 step, 每个 step 写 step_events 并 idx+1"""
        events = list(state["step_events"])
        idx = state["current_step_idx"]
        for raw_step in state["plan_steps"][idx:]:
            step_obj = DSLStep(**raw_step)
            start_t = time.time()
            events.append(
                StepEvent(
                    step_id=step_obj.step_id,
                    status="running",
                    started_at=start_t,
                    ended_at=None,
                    diff=None,
                    llm_calls=[],
                    error=None,
                )
            )
            result = await step_exe.execute(step_obj)
            events[-1] = StepEvent(
                step_id=step_obj.step_id,
                status=result.status,
                started_at=start_t,
                ended_at=time.time(),
                diff=result.diff,
                llm_calls=[],
                error=result.error,
            )
            idx += 1
            if result.status == "failed":
                return {"current_step_idx": idx, "step_events": events}
        return {"current_step_idx": idx, "step_events": events}

    async def _verify(state: OrchestratorState) -> dict:
        """MVP: lint/test 留待 mcp 接入和真 sandbox 后实现, 暂直通"""
        return {}

    async def _clarify(s: OrchestratorState) -> dict:
        return await node_clarify(s, deps)

    async def _router(s: OrchestratorState) -> dict:
        return await node_router(s, deps)

    async def _slot_check(s: OrchestratorState) -> dict:
        return await node_slot_check(s, deps)

    async def _plan_builder(s: OrchestratorState) -> dict:
        return await node_plan_builder(s, deps)

    async def _pr_creator(s: OrchestratorState) -> dict:
        return await node_pr_creator(s, deps)

    g = StateGraph(OrchestratorState)
    g.add_node("clarify", _clarify)
    g.add_node("router", _router)
    g.add_node("slot_check", _slot_check)
    g.add_node("plan_builder", _plan_builder)
    g.add_node("step_executor", _step_loop)
    g.add_node("verify", _verify)
    g.add_node("pr_creator", _pr_creator)

    g.add_edge(START, "clarify")
    g.add_edge("clarify", "router")
    g.add_edge("router", "slot_check")
    g.add_edge("slot_check", "plan_builder")
    g.add_edge("plan_builder", "step_executor")
    g.add_edge("step_executor", "verify")
    g.add_edge("verify", "pr_creator")
    g.add_edge("pr_creator", END)

    return g.compile(
        checkpointer=checkpointer,
        interrupt_before=["plan_builder", "step_executor", "pr_creator"],
    )
