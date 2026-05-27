import pytest
from pydantic import ValidationError
from app.agents.llm_protocol import LLMResponse, FakeLLM


class TestLLMResponse:
    def test_minimal_valid(self):
        r = LLMResponse(
            content="hi", tokens_in=10, tokens_out=5, latency_ms=120, cost_cny=0.001
        )
        assert r.content == "hi"

    def test_tokens_non_negative(self):
        with pytest.raises(ValidationError):
            LLMResponse(
                content="x", tokens_in=-1, tokens_out=0, latency_ms=0, cost_cny=0.0
            )


class TestFakeLLM:
    async def test_returns_canned(self):
        llm = FakeLLM(canned=["hello", "world"])
        r1 = await llm.chat([{"role": "user", "content": "first"}])
        r2 = await llm.chat([{"role": "user", "content": "second"}])
        assert r1.content == "hello"
        assert r2.content == "world"

    async def test_records_calls(self):
        llm = FakeLLM(canned=["x"])
        await llm.chat([{"role": "user", "content": "abc"}], temperature=0.7)
        assert len(llm.calls) == 1
        assert llm.calls[0]["messages"][0]["content"] == "abc"
        assert llm.calls[0]["temperature"] == 0.7

    async def test_exhausted_raises(self):
        llm = FakeLLM(canned=["only"])
        await llm.chat([{"role": "user", "content": "x"}])
        with pytest.raises(IndexError):
            await llm.chat([{"role": "user", "content": "y"}])


class TestFakeLLMToolCalls:
    """v3 Task 10: FakeLLM canned 支持 tool_calls; tools= 入参被记录."""

    async def test_tool_calls_dict_simple(self):
        from app.agents.llm_protocol import ToolCall

        llm = FakeLLM(
            canned=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "c1",
                            "name": "readFileTool",
                            "arguments": {"file": "a.js"},
                        }
                    ],
                },
            ]
        )
        r = await llm.chat([{"role": "user", "content": "x"}])
        assert len(r.tool_calls) == 1
        assert isinstance(r.tool_calls[0], ToolCall)
        assert r.tool_calls[0].name == "readFileTool"
        assert r.tool_calls[0].arguments == {"file": "a.js"}

    async def test_tool_calls_openai_format(self):
        """canned 也支持完整 OpenAI 格式 (含 function 嵌套)."""
        llm = FakeLLM(
            canned=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "c2",
                            "type": "function",
                            "function": {
                                "name": "grepTool",
                                "arguments": '{"pattern":"x"}',
                            },
                        }
                    ],
                },
            ]
        )
        r = await llm.chat([{"role": "user", "content": "x"}])
        assert r.tool_calls[0].name == "grepTool"
        assert r.tool_calls[0].arguments == {"pattern": "x"}

    async def test_tools_param_recorded(self):
        """LLMClient.chat tools= 入参必须被 FakeLLM 记录, agent 测试要校验."""
        llm = FakeLLM(canned=["ok"])
        tools_schema = [
            {
                "type": "function",
                "function": {
                    "name": "readFileTool",
                    "description": "...",
                    "parameters": {},
                },
            }
        ]
        await llm.chat(
            [{"role": "user", "content": "x"}],
            tools=tools_schema,
        )
        assert llm.calls[0]["tools"] == tools_schema

    async def test_str_canned_yields_no_tool_calls(self):
        """旧风格 str canned 必须继续工作, tool_calls 默认空."""
        llm = FakeLLM(canned=["plain"])
        r = await llm.chat([{"role": "user", "content": "x"}])
        assert r.tool_calls == []
