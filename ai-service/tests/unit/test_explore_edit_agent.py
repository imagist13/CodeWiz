"""ExploreEditAgent 主循环 (v3 Task 11).

测试形态: FakeLLM 喂 canned 序列, 用 stub dispatch 替代真 dispatch_tool,
acceptance 用真本地文件 (tmp_path) 验证。
"""

from __future__ import annotations
from pathlib import Path


from app.agents.explore_edit_agent import ExploreEditAgent, AgentRunResult
from app.agents.llm_protocol import FakeLLM
from app.harness.tools import ToolResult
from app.skills.contract import SkillContract
from app.skills.acceptance import FileContains


def _make_dispatch(behaviors: dict):
    """behaviors: {tool_name: callable(args) -> (result, is_error)}"""
    log = []

    def dispatch(tool_name, call_id, args):
        log.append({"name": tool_name, "args": args, "id": call_id})
        if tool_name in behaviors:
            result, is_error = behaviors[tool_name](args)
        else:
            result, is_error = "OK", False
        return ToolResult(
            tool_call_id=call_id,
            tool_name=tool_name,
            result=result,
            is_error=is_error,
        )

    dispatch.log = log
    return dispatch


def _contract_passes(viewcount_file: Path) -> SkillContract:
    """contract: ArticleMeta.jsx 含 viewCount."""
    return SkillContract(
        goal="加 viewCount",
        constraints=[],
        forbid=[],
        acceptance=[
            FileContains(path=str(viewcount_file), needle="viewCount"),
        ],
    )


class TestHappyPath:
    async def test_tool_call_then_stop_acceptance_pass(self, tmp_path):
        """canned: [tool_call(read), 无 tool_call] → 1 iter 调工具 + 1 iter 停, acceptance pass."""
        target = tmp_path / "ArticleMeta.jsx"
        target.write_text("viewCount field present")

        llm = FakeLLM(
            canned=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "c1",
                            "name": "readFileTool",
                            "arguments": {"file": "ArticleMeta.jsx"},
                        }
                    ],
                },
                {"content": "done"},  # 无 tool_calls → 触发 acceptance
            ]
        )
        dispatch = _make_dispatch({})
        agent = ExploreEditAgent(
            llm=llm, repo_root=tmp_path, max_iters=5, dispatch=dispatch
        )

        result = await agent.run(_contract_passes(target))

        assert isinstance(result, AgentRunResult)
        assert result.ok is True
        assert result.iters == 2  # 1 tool iter + 1 stop iter
        assert all(r.ok for r in result.acceptance)
        assert len(dispatch.log) == 1
        assert dispatch.log[0]["name"] == "readFileTool"

    async def test_diff_files_collected_from_writes(self, tmp_path):
        """write/replace 工具成功后, diff_files 收集 file 路径."""
        target = tmp_path / "x.jsx"
        target.write_text("viewCount")

        llm = FakeLLM(
            canned=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "c1",
                            "name": "writeFileTool",
                            "arguments": {"file": "x.jsx", "content": "viewCount"},
                        },
                        {
                            "id": "c2",
                            "name": "replaceInFileTool",
                            "arguments": {
                                "file": "y.jsx",
                                "old_text": "a",
                                "new_text": "b",
                            },
                        },
                    ],
                },
                {"content": "done"},
            ]
        )
        dispatch = _make_dispatch({})
        agent = ExploreEditAgent(
            llm=llm, repo_root=tmp_path, max_iters=5, dispatch=dispatch
        )
        result = await agent.run(_contract_passes(target))
        assert "x.jsx" in result.diff_files
        assert "y.jsx" in result.diff_files


class TestAcceptanceFailureRetry:
    async def test_acceptance_fail_triggers_retry_with_template(self, tmp_path):
        """第一次停 → acceptance fail (target 不含 viewCount) → 回灌模板 + 重试."""
        target = tmp_path / "x.jsx"
        target.write_text("nothing here")  # 不含 viewCount

        llm = FakeLLM(
            canned=[
                {"content": "stop early"},  # iter 0 stop, acceptance fail
                {"content": "stop again"},  # iter 1 stop, acceptance fail again
            ]
        )
        dispatch = _make_dispatch({})
        agent = ExploreEditAgent(
            llm=llm, repo_root=tmp_path, max_iters=2, dispatch=dispatch
        )
        result = await agent.run(_contract_passes(target))

        assert result.ok is False
        # 第二次调用 LLM 时, messages 应含 ACCEPTANCE_FAILURE_TEMPLATE 片段
        second_call_messages = llm.calls[1]["messages"]
        flat = " ".join(
            m.get("content", "") if isinstance(m.get("content"), str) else ""
            for m in second_call_messages
        )
        assert "Acceptance failed" in flat


class TestToolErrorRecovery:
    async def test_tool_error_appends_recovery_template(self, tmp_path):
        """工具返 is_error=True → 加 TOOL_ERROR_RECOVERY 用户消息."""
        target = tmp_path / "x.jsx"
        target.write_text("viewCount")

        llm = FakeLLM(
            canned=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "c1",
                            "name": "writeFileTool",
                            "arguments": {"file": "z.jsx", "content": "x"},
                        },
                    ],
                },
                {"content": "done"},
            ]
        )
        dispatch = _make_dispatch(
            {"writeFileTool": lambda args: ("disk full simulated error", True)}
        )
        agent = ExploreEditAgent(
            llm=llm, repo_root=tmp_path, max_iters=5, dispatch=dispatch
        )
        await agent.run(_contract_passes(target))

        # 第二次 LLM 调用的 messages 里应该有 TOOL_ERROR_RECOVERY 片段
        second_call_messages = llm.calls[1]["messages"]
        flat = " ".join(
            m.get("content", "") if isinstance(m.get("content"), str) else ""
            for m in second_call_messages
        )
        assert "previous tool call failed" in flat.lower()
        assert "writeFileTool" in flat


class TestMaxIters:
    async def test_respects_max_iters(self, tmp_path):
        """canned 一直返 tool_calls → 达到 max_iters 必须停."""
        target = tmp_path / "x.jsx"
        target.write_text("nope")

        # 5 个 tool_call canned, max_iters=3
        canned = [
            {
                "content": "",
                "tool_calls": [
                    {
                        "id": f"c{i}",
                        "name": "readFileTool",
                        "arguments": {"file": "x.jsx"},
                    }
                ],
            }
            for i in range(5)
        ]
        llm = FakeLLM(canned=canned)
        dispatch = _make_dispatch({})
        agent = ExploreEditAgent(
            llm=llm, repo_root=tmp_path, max_iters=3, dispatch=dispatch
        )
        result = await agent.run(_contract_passes(target))

        assert result.iters == 3
        assert result.ok is False  # 没机会跑 acceptance, target 内容也不达标
        assert len(dispatch.log) == 3


class TestPolicyIntegration:
    async def test_policy_dispatch_is_default(self, tmp_path):
        """默认 dispatch 是 policy_dispatch — 写 .env 会被拦截."""
        from app.agents.explore_edit_agent import ExploreEditAgent as Agent

        target = tmp_path / "x.jsx"
        target.write_text("viewCount")

        llm = FakeLLM(
            canned=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "c1",
                            "name": "writeFileTool",
                            "arguments": {"file": ".env", "content": "evil=1"},
                        },
                    ],
                },
                {"content": "done"},
            ]
        )
        # 不显式传 dispatch → 走 policy_dispatch
        agent = Agent(llm=llm, repo_root=tmp_path, max_iters=5)
        await agent.run(_contract_passes(target))

        # tool 结果消息应包含 ForbiddenPath
        second_call_messages = llm.calls[1]["messages"]
        flat = " ".join(
            (m.get("content") or "") if isinstance(m.get("content"), str) else ""
            for m in second_call_messages
        )
        assert "Forbidden" in flat


class TestToolsParamPassedToLlm:
    async def test_tools_schema_passed(self, tmp_path):
        """tools_schema 必须经 llm.chat(tools=...) 传给模型, 这是 OpenAI 协议必需."""
        target = tmp_path / "x.jsx"
        target.write_text("viewCount")

        schema = [
            {
                "type": "function",
                "function": {
                    "name": "readFileTool",
                    "description": "...",
                    "parameters": {},
                },
            },
        ]
        llm = FakeLLM(canned=[{"content": "done"}])
        agent = ExploreEditAgent(
            llm=llm,
            repo_root=tmp_path,
            max_iters=5,
            tools_schema=schema,
            dispatch=_make_dispatch({}),
        )
        await agent.run(_contract_passes(target))

        assert llm.calls[0]["tools"] == schema


class TestTraceShape:
    async def test_trace_records_each_iter(self, tmp_path):
        target = tmp_path / "x.jsx"
        target.write_text("viewCount")

        llm = FakeLLM(
            canned=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "c1",
                            "name": "readFileTool",
                            "arguments": {"file": "x.jsx"},
                        }
                    ],
                },
                {"content": "done"},
            ]
        )
        agent = ExploreEditAgent(
            llm=llm,
            repo_root=tmp_path,
            max_iters=5,
            dispatch=_make_dispatch({}),
        )
        result = await agent.run(_contract_passes(target))

        assert len(result.trace) == 2
        assert result.trace[0]["iter"] == 0
        assert result.trace[0]["tool_calls"] == ["readFileTool"]
        assert result.trace[1]["iter"] == 1
        assert result.trace[1]["tool_calls"] == []
