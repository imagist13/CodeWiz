"""ToolCall Pydantic + OpenAI 协议双向转换 (v3 Task 10).

OpenAI tool-calling 协议下, assistant 返:
  {"role": "assistant", "tool_calls": [
      {"id": "call_xxx", "type": "function",
       "function": {"name": "readFileTool", "arguments": '{"file":"a.js"}'}}
  ]}

ToolCall 把它解析为强类型 Pydantic, 同时支持反向回灌 messages。
"""

import json

from app.agents.llm_protocol import ToolCall


class TestToolCall:
    def test_minimal_valid(self):
        tc = ToolCall(id="call_1", name="readFileTool", arguments={"file": "a.js"})
        assert tc.id == "call_1"
        assert tc.name == "readFileTool"
        assert tc.arguments == {"file": "a.js"}

    def test_from_openai_with_string_arguments(self):
        """OpenAI 返 arguments 是 JSON 字符串, 必须自动反序列化."""
        raw = {
            "id": "call_abc",
            "type": "function",
            "function": {
                "name": "readFileTool",
                "arguments": json.dumps({"file": "x.js"}),
            },
        }
        tc = ToolCall.from_openai(raw)
        assert tc.id == "call_abc"
        assert tc.name == "readFileTool"
        assert tc.arguments == {"file": "x.js"}

    def test_from_openai_with_dict_arguments(self):
        """有些实现已经把 arguments 解析过, 也要支持."""
        raw = {
            "id": "call_2",
            "type": "function",
            "function": {
                "name": "grepTool",
                "arguments": {"pattern": "x", "path": "."},
            },
        }
        tc = ToolCall.from_openai(raw)
        assert tc.arguments == {"pattern": "x", "path": "."}

    def test_to_openai_round_trip(self):
        """to_openai 必须能直接塞回 messages[].tool_calls 字段."""
        tc = ToolCall(
            id="call_3",
            name="writeFileTool",
            arguments={"file": "a.js", "content": "x"},
        )
        d = tc.to_openai()
        assert d["id"] == "call_3"
        assert d["type"] == "function"
        assert d["function"]["name"] == "writeFileTool"
        # arguments 必须是字符串 (OpenAI 协议要求)
        assert isinstance(d["function"]["arguments"], str)
        # 字段无损
        assert json.loads(d["function"]["arguments"]) == {
            "file": "a.js",
            "content": "x",
        }

    def test_round_trip_from_to(self):
        raw = {
            "id": "call_x",
            "type": "function",
            "function": {"name": "f", "arguments": json.dumps({"a": 1, "b": "中文"})},
        }
        tc = ToolCall.from_openai(raw)
        back = tc.to_openai()
        assert back["id"] == raw["id"]
        assert back["function"]["name"] == raw["function"]["name"]
        assert json.loads(back["function"]["arguments"]) == {"a": 1, "b": "中文"}

    def test_empty_arguments_string(self):
        """arguments 是空字符串时, 反序列化为空 dict."""
        raw = {
            "id": "c",
            "type": "function",
            "function": {"name": "f", "arguments": ""},
        }
        tc = ToolCall.from_openai(raw)
        assert tc.arguments == {}
