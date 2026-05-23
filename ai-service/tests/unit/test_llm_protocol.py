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
