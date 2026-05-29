from app.orchestrator.state import (
    StepEvent,
    new_state,
)


class TestNewState:
    def test_initializes_required_fields(self):
        s = new_state(
            session_id="abc",
            repo_clone_path="/tmp/conduit",
            branch_name="feat/x",
            raw_intent="加阅读量",
        )
        assert s["session_id"] == "abc"
        assert s["raw_intent"] == "加阅读量"
        assert s["plan_steps"] == []
        assert s["step_events"] == []
        assert s["current_step_idx"] == 0
        assert s["awaiting_gate"] is None
        assert s["pr_url"] is None

    def test_filled_params_starts_empty(self):
        s = new_state(
            session_id="x", repo_clone_path="/x", branch_name="b", raw_intent="i"
        )
        assert s["filled_params"] == {}
        assert s["pm_answers"] == {}

    def test_state_is_dict_assignable(self):
        s = new_state(
            session_id="x", repo_clone_path="/x", branch_name="b", raw_intent="i"
        )
        s["matched_skill"] = "add_view_count"
        s["skill_confidence"] = 0.67
        assert s["matched_skill"] == "add_view_count"


class TestStepEvent:
    def test_default_status_pending(self):
        ev: StepEvent = {
            "step_id": "s1",
            "status": "pending",
            "started_at": 0.0,
            "ended_at": None,
            "diff": None,
            "llm_calls": [],
            "error": None,
        }
        assert ev["status"] == "pending"


class TestNewStateContractFields:
    """v3 §C Step 1: state 加 4 个 contract 相关字段."""

    def test_contract_fields_default(self):
        s = new_state(
            session_id="x", repo_clone_path="/x", branch_name="b", raw_intent="i"
        )
        assert s["skill_contract"] is None
        assert s["acceptance_results"] == []
        assert s["pending_diff"] == []
        assert s["trace_id"] is None

    def test_contract_fields_serializable(self):
        """所有新字段必须是 JSON 可序列化原生类型 (PostgresSaver 约束)."""
        import json

        s = new_state(
            session_id="x", repo_clone_path="/x", branch_name="b", raw_intent="i"
        )
        s["skill_contract"] = {
            "goal": "加 viewCount",
            "constraints": [],
            "forbid": [],
            "acceptance": [],
            "candidate_symbols": [],
        }
        s["acceptance_results"] = [
            {"check": "FileContains(...)", "ok": True, "detail": ""}
        ]
        s["pending_diff"] = ["x.jsx", "y.jsx"]
        s["trace_id"] = "trace_abc"
        # 不抛 = 可序列化
        json.dumps(s, ensure_ascii=False)
