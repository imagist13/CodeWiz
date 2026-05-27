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
    async def test_mocked_pr_url_returned_when_env_unset(
        self, deps_factory, monkeypatch
    ):
        """env CODEWIZ_HEAD_REPO 未设时走旧 mock 行为 (向后兼容)."""
        monkeypatch.delenv("CODEWIZ_HEAD_REPO", raising=False)
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

    async def test_uses_pr_creator_dry_run_when_env_set(
        self, deps_factory, monkeypatch, tmp_path
    ):
        """env CODEWIZ_HEAD_REPO 设了 → 走 PrCreator (默认 dry_run=True)."""
        from unittest.mock import patch as mock_patch
        import subprocess

        monkeypatch.setenv("CODEWIZ_HEAD_REPO", "team/conduit")
        monkeypatch.delenv("CODEWIZ_PR_DRY_RUN", raising=False)  # 默认 true

        state = new_state(
            session_id="s",
            repo_clone_path=str(tmp_path),
            branch_name="feat/x",
            raw_intent="加 viewCount",
        )
        state["matched_skill"] = "add_view_count"

        calls = []

        def fake_run(argv, *args, **kwargs):
            calls.append(tuple(argv))
            return subprocess.CompletedProcess(
                args=argv, returncode=0, stdout="patch", stderr=""
            )

        with mock_patch("subprocess.run", side_effect=fake_run):
            out = await node_pr_creator(state, deps_factory(FakeLLM(canned=[])))

        assert "dry-run" in out["pr_url"].lower()
        # 验证 git commands 被调 (checkout/add/commit/format-patch)
        cmds = [c[:2] for c in calls]
        assert ("git", "checkout") in cmds
        assert ("git", "commit") in cmds
        # dry_run 默认 true → 不应有 git push / gh
        assert ("git", "push") not in cmds
        assert not any(c[0] == "gh" for c in calls)


# --- v3 §C Step 2: contract 路径新节点 ---


class TestNodeLoadContract:
    async def test_returns_dict_for_view_count(self, deps_factory):
        from app.orchestrator.nodes import node_load_contract

        state = new_state(
            session_id="s",
            repo_clone_path="/x",
            branch_name="b",
            raw_intent="加 viewCount",
        )
        state["matched_skill"] = "add_view_count"
        state["filled_params"] = {"default": 0}
        out = await node_load_contract(state, deps_factory(FakeLLM(canned=[])))
        assert out["skill_contract"] is not None
        assert "viewCount" in out["skill_contract"]["goal"]
        # 必须是 dict (JSON-serializable for checkpointer)
        assert isinstance(out["skill_contract"], dict)

    async def test_returns_none_for_old_skill(self, deps_factory):
        """没 override contract() 的旧 Skill → None (走旧 plan() 路径)."""
        from app.orchestrator.nodes import node_load_contract

        state = new_state(
            session_id="s",
            repo_clone_path="/x",
            branch_name="b",
            raw_intent="加 about me tab",
        )
        state["matched_skill"] = "add_about_me_tab"
        state["filled_params"] = {}
        out = await node_load_contract(state, deps_factory(FakeLLM(canned=[])))
        assert out["skill_contract"] is None


class TestNodeExploreEdit:
    async def test_runs_agent_with_canned_llm(self, deps_factory, tmp_path):
        """FakeLLM canned 直接停 (无 tool_call), acceptance 在 tmp_path 验证."""
        from app.orchestrator.nodes import node_explore_edit

        # 准备一个能通过 contract_l1a acceptance 的最小文件结构
        articles_preview = (
            tmp_path / "frontend" / "src" / "components" / "ArticlesPreview"
        )
        articles_preview.mkdir(parents=True)
        (articles_preview / "ArticlesPreview.jsx").write_text(
            "<div className='card'>viewCount: {viewCount}</div>"
        )

        state = new_state(
            session_id="s",
            repo_clone_path=str(tmp_path),
            branch_name="b",
            raw_intent="加 viewCount",
        )
        state["matched_skill"] = "add_view_count"
        state["filled_params"] = {"default": 0}
        # 先 load_contract
        from app.orchestrator.nodes import node_load_contract

        load_out = await node_load_contract(state, deps_factory(FakeLLM(canned=[])))
        state["skill_contract"] = load_out["skill_contract"]

        # canned 直接 stop (无 tool_calls)
        llm = FakeLLM(canned=[{"content": "done"}])
        out = await node_explore_edit(state, deps_factory(llm))
        assert isinstance(out["acceptance_results"], list)
        assert len(out["acceptance_results"]) >= 1
        # 应全过 (文件已存在, viewCount 已含)
        assert all(r["ok"] for r in out["acceptance_results"])
        # diff_files 是 list (此场景 agent 没改任何文件)
        assert out["pending_diff"] == []


class TestNodeTrace:
    async def test_assigns_trace_id(self, deps_factory):
        """trace_id 不存在时分配新的; 存在时保留."""
        from app.orchestrator.nodes import node_trace

        state = new_state(
            session_id="s", repo_clone_path="/x", branch_name="b", raw_intent="i"
        )
        out = await node_trace(state, deps_factory(FakeLLM(canned=[])))
        assert out["trace_id"]
        assert isinstance(out["trace_id"], str)

    async def test_preserves_existing_trace_id(self, deps_factory):
        from app.orchestrator.nodes import node_trace

        state = new_state(
            session_id="s", repo_clone_path="/x", branch_name="b", raw_intent="i"
        )
        state["trace_id"] = "preset_id"
        out = await node_trace(state, deps_factory(FakeLLM(canned=[])))
        assert out["trace_id"] == "preset_id"

    async def test_writes_jsonl_events_from_state(
        self, deps_factory, tmp_path, monkeypatch
    ):
        """state 含 contract / diff / acceptance / pr_url → 4 类事件落盘."""
        from app.orchestrator.nodes import node_trace
        import json

        log = tmp_path / "trace.jsonl"
        monkeypatch.setenv("CODEWIZ_TRACE_PATH", str(log))

        state = new_state(
            session_id="s",
            repo_clone_path="/x",
            branch_name="feat/x",
            raw_intent="加 viewCount",
        )
        state["matched_skill"] = "add_view_count"
        state["skill_contract"] = {
            "goal": "加 viewCount",
            "constraints": [],
            "forbid": [],
            "acceptance": [{"kind": "file_contains"}, {"kind": "grep_in_dir"}],
            "candidate_symbols": [],
        }
        state["pending_diff"] = ["x.jsx", "y.jsx"]
        state["acceptance_results"] = [
            {"check": "FileContains(...)", "ok": True, "detail": ""},
            {"check": "GrepInDir(...)", "ok": False, "detail": "hits=0"},
        ]
        state["pr_url"] = "https://github.com/team/conduit/pull/1"

        await node_trace(state, deps_factory(FakeLLM(canned=[])))

        lines = log.read_text().strip().splitlines()
        kinds = [json.loads(ln)["kind"] for ln in lines]
        # 1 contract_loaded + 1 diff_summary + 2 acceptance + 1 pr_created
        assert kinds.count("contract_loaded") == 1
        assert kinds.count("diff_summary") == 1
        assert kinds.count("acceptance") == 2
        assert kinds.count("pr_created") == 1
        # 所有事件共享同一 trace_id
        ids = {json.loads(ln)["trace_id"] for ln in lines}
        assert len(ids) == 1
