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
