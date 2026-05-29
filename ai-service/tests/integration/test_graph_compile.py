import json
from pathlib import Path

from app.orchestrator.graph import build_graph
from app.orchestrator.state import new_state
from app.orchestrator.checkpointer import (
    make_checkpointer,
    CheckpointerKind,
)
from app.agents.llm_protocol import FakeLLM


FIXTURE = Path(__file__).parent.parent / "fixtures" / "conduit_mini"


class TestBuildGraph:
    def test_compiles_with_checkpointer(self):
        llm = FakeLLM(canned=[])
        cp = make_checkpointer(CheckpointerKind.MEMORY)
        graph = build_graph(
            sandbox_root=str(FIXTURE),
            llm=llm,
            checkpointer=cp,
        )
        # langgraph 1.x compiled graph 有 .nodes 字典 + .invoke
        assert hasattr(graph, "invoke")
        assert hasattr(graph, "ainvoke")

    async def test_pauses_at_clarify_gate(self, tmp_path):
        # 跑到 slot_check 后应触发 interrupt_before=plan_builder
        import shutil

        sandbox = tmp_path / "conduit"
        shutil.copytree(str(FIXTURE), str(sandbox))

        llm = FakeLLM(
            canned=[
                "用户想加 viewCount",
                json.dumps({"questions": []}),
            ]
        )
        cp = make_checkpointer(CheckpointerKind.MEMORY)
        graph = build_graph(sandbox_root=str(sandbox), llm=llm, checkpointer=cp)

        state = new_state(
            session_id="s1",
            repo_clone_path=str(sandbox),
            branch_name="feat/x",
            raw_intent="加阅读量",
        )
        config = {"configurable": {"thread_id": "s1"}}
        result = await graph.ainvoke(state, config=config)
        # interrupt_before plan_builder: 跑到 slot_check 就停
        assert result["matched_skill"] == "add_view_count"
        assert result["filled_params"] == {"default": 0}
        # plan_steps 还没填
        assert result["plan_steps"] == []
