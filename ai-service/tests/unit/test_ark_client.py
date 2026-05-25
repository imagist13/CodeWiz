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
