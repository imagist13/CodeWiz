from app.agents.slot_check import SlotChecker


class FakeSkill:
    """test double，避免依赖具体 BusinessSkill"""

    params_schema = {
        "default": {"type": "int", "required": False, "default": 0, "doc": "初始值"},
        "scope": {"type": "string", "required": True, "doc": "global or per_user"},
    }


class TestSlotChecker:
    def test_no_missing_when_all_filled(self):
        checker = SlotChecker()
        r = checker.check(FakeSkill, {"default": 5, "scope": "global"})
        assert r.missing == []
        assert r.questions == []

    def test_missing_required(self):
        checker = SlotChecker()
        r = checker.check(FakeSkill, {"default": 5})
        assert "scope" in r.missing

    def test_optional_not_in_missing(self):
        checker = SlotChecker()
        r = checker.check(FakeSkill, {"scope": "global"})
        assert "default" not in r.missing

    def test_questions_use_doc(self):
        checker = SlotChecker()
        r = checker.check(FakeSkill, {})
        assert any("global or per_user" in q for q in r.questions)

    def test_optional_uses_default_when_absent(self):
        checker = SlotChecker()
        r = checker.check(FakeSkill, {"scope": "global"})
        assert r.filled["default"] == 0  # default 来自 schema

    def test_filled_includes_user_provided(self):
        checker = SlotChecker()
        r = checker.check(FakeSkill, {"default": 42, "scope": "x"})
        assert r.filled["default"] == 42
        assert r.filled["scope"] == "x"
