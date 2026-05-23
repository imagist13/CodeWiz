from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.observability.models import LLMCall, Base


def test_llm_call_columns_and_defaults():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng)
    db = Session()
    row = LLMCall(
        session_id="s1",
        skill_name="add_view_count",
        prompt_key="add_field_model",
        tokens_in=100,
        tokens_out=50,
        latency_ms=320,
        cost_cny=0.0023,
        model="ep-20260514110933-mzh58",
        status="ok",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    assert row.id is not None
    assert row.created_at is not None
    assert row.error_msg is None


def test_llm_call_failed_status_with_error():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng)
    db = Session()
    row = LLMCall(
        session_id="s1",
        status="error",
        error_msg="timeout after 30s",
        tokens_in=0,
        tokens_out=0,
        latency_ms=30000,
        cost_cny=0.0,
        model="ep-X",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    assert row.status == "error"
    assert row.error_msg == "timeout after 30s"
