import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.observability.llm_recorder import LLMRecorder
from app.observability.models import LLMCall, Base
from app.agents.llm_protocol import FakeLLM


@pytest.fixture
def session_factory():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)


class TestLLMRecorder:
    async def test_records_successful_call(self, session_factory):
        llm = FakeLLM(canned=["hello"])
        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        wrapped = rec.wrap(llm)
        out = await wrapped.chat(
            [{"role": "user", "content": "hi"}],
            skill_name="add_view_count",
            prompt_key="add_field_model",
            step_id="step1",
        )
        assert out.content == "hello"
        with session_factory() as db:
            rows = db.query(LLMCall).all()
            assert len(rows) == 1
            assert rows[0].session_id == "s1"
            assert rows[0].skill_name == "add_view_count"
            assert rows[0].step_id == "step1"
            assert rows[0].status == "ok"
            assert rows[0].tokens_out == len("hello")

    async def test_records_failed_call(self, session_factory):
        class FailingLLM:
            async def chat(self, *_a, **_k):
                raise RuntimeError("API timeout")

        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        wrapped = rec.wrap(FailingLLM())
        with pytest.raises(RuntimeError):
            await wrapped.chat([{"role": "user", "content": "x"}])

        with session_factory() as db:
            rows = db.query(LLMCall).all()
            assert len(rows) == 1
            assert rows[0].status == "error"
            assert "timeout" in rows[0].error_msg

    async def test_wrap_is_transparent_for_existing_kwargs(self, session_factory):
        llm = FakeLLM(canned=["ok"])
        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        wrapped = rec.wrap(llm)
        await wrapped.chat(
            [{"role": "user", "content": "x"}], temperature=0.5, max_tokens=512
        )
        assert llm.calls[0]["temperature"] == 0.5
        assert llm.calls[0]["max_tokens"] == 512
