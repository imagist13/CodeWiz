import json
from pathlib import Path
import pytest

from app.agents.llm_protocol import FakeLLM
from app.orchestrator.state import new_state
from app.orchestrator.nodes import (
    NodeDeps,
    node_clarify,
    node_router,
    node_slot_check,
    node_plan_builder,
    node_pr_creator,
)
from app.skills.registry import SkillRegistry
from app.codemap.scanner import scan_conduit


FIXTURE = Path(__file__).parent.parent / "fixtures" / "conduit_mini"


@pytest.fixture
def deps_factory():
    def _mk(llm):
        return NodeDeps(
            registry=SkillRegistry.discover("app.skills"),
            codemap=scan_conduit(str(FIXTURE)),
            llm=llm,
        )

    return _mk


class TestNodeClarify:
    async def test_writes_questions_and_understanding(self, deps_factory):
        llm = FakeLLM(
            canned=[
                "用户想加 viewCount 字段",
                json.dumps({"questions": ["按用户还是全局？"]}),
            ]
        )
        state = new_state(
            session_id="s", repo_clone_path="/x", branch_name="b", raw_intent="加阅读量"
        )
        out = await node_clarify(state, deps_factory(llm))
        assert "按用户还是全局？" in out["pending_questions"]
        assert "viewCount" in out["reflexion_critique"]


class TestNodeRouter:
    async def test_routes_to_add_view_count(self, deps_factory):
        state = new_state(
            session_id="s",
            repo_clone_path="/x",
            branch_name="b",
            raw_intent="给文章加阅读量",
        )
        out = await node_router(state, deps_factory(FakeLLM(canned=[])))
        assert out["matched_skill"] == "add_view_count"
        assert out["skill_confidence"] > 0.5


class TestNodeSlotCheck:
    async def test_fills_default_and_no_missing(self, deps_factory):
        state = new_state(
            session_id="s",
            repo_clone_path="/x",
            branch_name="b",
            raw_intent="给文章加阅读量",
        )
        state["matched_skill"] = "add_view_count"
        out = await node_slot_check(state, deps_factory(FakeLLM(canned=[])))
        assert out["filled_params"]["default"] == 0


class TestNodePlanBuilder:
    async def test_emits_plan_steps_dump(self, deps_factory):
        state = new_state(
            session_id="s",
            repo_clone_path="/x",
            branch_name="b",
            raw_intent="给文章加阅读量",
        )
        state["matched_skill"] = "add_view_count"
        state["filled_params"] = {"default": 0}
        out = await node_plan_builder(state, deps_factory(FakeLLM(canned=[])))
        steps = out["plan_steps"]
        assert len(steps) >= 8  # add_field 8 + inject_display 1
        # 序列化友好: 都是 dict
        assert all(isinstance(s, dict) for s in steps)


class TestNodePrCreator:
    async def test_mocked_pr_url_returned(self, deps_factory):
        state = new_state(
            session_id="s",
            repo_clone_path="/x",
            branch_name="feat/add-view-count",
            raw_intent="给文章加阅读量",
        )
        state["matched_skill"] = "add_view_count"
        out = await node_pr_creator(state, deps_factory(FakeLLM(canned=[])))
        assert out["pr_url"].startswith("https://github.com/")
        assert "feat/add-view-count" in out["pr_url"]
