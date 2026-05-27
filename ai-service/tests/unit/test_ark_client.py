import json

import httpx
import pytest

from app.llm.ark_client import ArkClient


def _mock_transport(handler):
    return httpx.MockTransport(handler)


def _ok_response(
    content: str = "hi",
    prompt_tokens: int = 5,
    completion_tokens: int = 3,
    reasoning_content: str = "",
    reasoning_tokens: int = 0,
):
    def handler(request):
        message = {"role": "assistant", "content": content}
        if reasoning_content:
            message["reasoning_content"] = reasoning_content
        return httpx.Response(
            200,
            json={
                "choices": [{"message": message}],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens,
                    "completion_tokens_details": {"reasoning_tokens": reasoning_tokens},
                },
            },
        )

    return handler


class TestArkClient:
    async def test_returns_llm_response(self):
        client = ArkClient(
            api_key="sk-x",
            endpoint_id="ep-1",
            transport=_mock_transport(_ok_response("hello", 5, 3)),
        )
        r = await client.chat([{"role": "user", "content": "hi"}])
        assert r.content == "hello"
        assert r.tokens_in == 5
        assert r.tokens_out == 3
        assert r.latency_ms >= 0
        assert r.cost_cny > 0

    async def test_request_body_uses_endpoint_id(self):
        captured = {}

        def handler(request):
            captured["body"] = json.loads(request.content)
            return _ok_response()(request)

        client = ArkClient(
            api_key="sk-x", endpoint_id="ep-mzh58", transport=_mock_transport(handler)
        )
        await client.chat(
            [{"role": "user", "content": "hi"}], temperature=0.7, max_tokens=100
        )
        assert captured["body"]["model"] == "ep-mzh58"
        assert captured["body"]["temperature"] == 0.7
        assert captured["body"]["max_tokens"] == 100
        assert captured["body"]["messages"][0]["content"] == "hi"

    async def test_authorization_header(self):
        captured = {}

        def handler(request):
            captured["auth"] = request.headers.get("Authorization")
            return _ok_response()(request)

        client = ArkClient(
            api_key="ark-3a6a", endpoint_id="ep", transport=_mock_transport(handler)
        )
        await client.chat([{"role": "user", "content": "hi"}])
        assert captured["auth"] == "Bearer ark-3a6a"

    async def test_request_url_hits_chat_completions(self):
        captured = {}

        def handler(request):
            captured["url"] = str(request.url)
            return _ok_response()(request)

        client = ArkClient(
            api_key="x", endpoint_id="ep", transport=_mock_transport(handler)
        )
        await client.chat([{"role": "user", "content": "hi"}])
        assert captured["url"].endswith("/api/v3/chat/completions")

    async def test_raises_on_http_error(self):
        def handler(request):
            return httpx.Response(401, json={"error": "unauthorized"})

        client = ArkClient(
            api_key="bad", endpoint_id="ep", transport=_mock_transport(handler)
        )
        with pytest.raises(httpx.HTTPStatusError):
            await client.chat([{"role": "user", "content": "hi"}])

    async def test_metadata_kwargs_accepted_and_ignored(self):
        client = ArkClient(
            api_key="x",
            endpoint_id="ep",
            transport=_mock_transport(_ok_response("ok")),
        )
        r = await client.chat(
            [{"role": "user", "content": "hi"}],
            skill_name="add_view_count",
            prompt_key="modify_routes_view_count",
            step_id="s-1",
        )
        assert r.content == "ok"

    async def test_cost_scales_with_tokens(self):
        client = ArkClient(
            api_key="x",
            endpoint_id="ep",
            transport=_mock_transport(_ok_response("x", 1000, 1000)),
        )
        r = await client.chat([{"role": "user", "content": "hi"}])
        assert r.cost_cny == pytest.approx(1000 / 1000 * 0.0008 + 1000 / 1000 * 0.002)

    async def test_parses_reasoning_content_and_tokens(self):
        client = ArkClient(
            api_key="x",
            endpoint_id="ep",
            transport=_mock_transport(
                _ok_response(
                    content="最终答案",
                    prompt_tokens=10,
                    completion_tokens=200,
                    reasoning_content="先分析需求...再决定方案...",
                    reasoning_tokens=180,
                )
            ),
        )
        r = await client.chat([{"role": "user", "content": "hi"}])
        assert r.content == "最终答案"
        assert r.reasoning_content == "先分析需求...再决定方案..."
        assert r.reasoning_tokens == 180
        assert r.tokens_out == 200

    async def test_reasoning_defaults_empty_when_absent(self):
        client = ArkClient(
            api_key="x",
            endpoint_id="ep",
            transport=_mock_transport(_ok_response("only content")),
        )
        r = await client.chat([{"role": "user", "content": "hi"}])
        assert r.reasoning_content == ""
        assert r.reasoning_tokens == 0

    async def test_default_max_tokens_is_4096(self):
        captured = {}

        def handler(request):
            captured["body"] = json.loads(request.content)
            return _ok_response()(request)

        client = ArkClient(
            api_key="x", endpoint_id="ep", transport=_mock_transport(handler)
        )
        await client.chat([{"role": "user", "content": "hi"}])
        assert captured["body"]["max_tokens"] == 4096


# ---- v3 Task 10: tool-calling + from_env ----


def _tool_response(tool_calls, content: str = ""):
    """assistant 返带 tool_calls 的响应 (OpenAI 协议)."""

    def handler(request):
        message = {"role": "assistant", "content": content, "tool_calls": tool_calls}
        return httpx.Response(
            200,
            json={
                "choices": [{"message": message}],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 20,
                    "total_tokens": 30,
                    "completion_tokens_details": {"reasoning_tokens": 0},
                },
            },
        )

    return handler


class TestArkClientToolCalls:
    async def test_tools_param_injected_into_body(self):
        captured = {}

        def handler(request):
            captured["body"] = json.loads(request.content)
            return _ok_response()(request)

        client = ArkClient(
            api_key="x", endpoint_id="ep", transport=_mock_transport(handler)
        )
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "readFileTool",
                    "description": "...",
                    "parameters": {"type": "object"},
                },
            }
        ]
        await client.chat([{"role": "user", "content": "x"}], tools=tools)
        assert captured["body"]["tools"] == tools

    async def test_tools_omitted_when_none(self):
        """tools=None 时 body 不能含 tools 字段, 避免某些 API 误判."""
        captured = {}

        def handler(request):
            captured["body"] = json.loads(request.content)
            return _ok_response()(request)

        client = ArkClient(
            api_key="x", endpoint_id="ep", transport=_mock_transport(handler)
        )
        await client.chat([{"role": "user", "content": "x"}])
        assert "tools" not in captured["body"]

    async def test_response_tool_calls_parsed(self):
        client = ArkClient(
            api_key="x",
            endpoint_id="ep",
            transport=_mock_transport(
                _tool_response(
                    [
                        {
                            "id": "call_xyz",
                            "type": "function",
                            "function": {
                                "name": "readFileTool",
                                "arguments": '{"file":"a.js"}',
                            },
                        }
                    ]
                )
            ),
        )
        r = await client.chat([{"role": "user", "content": "x"}])
        assert len(r.tool_calls) == 1
        assert r.tool_calls[0].id == "call_xyz"
        assert r.tool_calls[0].name == "readFileTool"
        assert r.tool_calls[0].arguments == {"file": "a.js"}

    async def test_response_no_tool_calls_defaults_empty(self):
        client = ArkClient(
            api_key="x",
            endpoint_id="ep",
            transport=_mock_transport(_ok_response("hi")),
        )
        r = await client.chat([{"role": "user", "content": "x"}])
        assert r.tool_calls == []


class TestArkClientFromEnv:
    def test_from_env_success(self, monkeypatch):
        monkeypatch.setenv("ARK_API_KEY", "sk-test")
        monkeypatch.setenv("ARK_ENDPOINT", "ep-1")
        monkeypatch.delenv("ARK_BASE_URL", raising=False)
        c = ArkClient.from_env()
        assert c._api_key == "sk-test"
        assert c._endpoint_id == "ep-1"
        # 默认 base url
        assert "ark.cn-beijing.volces.com" in c._url

    def test_from_env_missing_key_raises(self, monkeypatch):
        monkeypatch.delenv("ARK_API_KEY", raising=False)
        monkeypatch.setenv("ARK_ENDPOINT", "ep-1")
        with pytest.raises(RuntimeError):
            ArkClient.from_env()

    def test_from_env_missing_endpoint_raises(self, monkeypatch):
        monkeypatch.setenv("ARK_API_KEY", "sk")
        monkeypatch.delenv("ARK_ENDPOINT", raising=False)
        with pytest.raises(RuntimeError):
            ArkClient.from_env()

    def test_from_env_supports_deepseek_base(self, monkeypatch):
        """切 DeepSeek: ARK_BASE_URL=https://api.deepseek.com + ARK_ENDPOINT=deepseek-chat."""
        monkeypatch.setenv("ARK_API_KEY", "sk")
        monkeypatch.setenv("ARK_ENDPOINT", "deepseek-chat")
        monkeypatch.setenv("ARK_BASE_URL", "https://api.deepseek.com")
        c = ArkClient.from_env()
        assert c._url == "https://api.deepseek.com/chat/completions"
