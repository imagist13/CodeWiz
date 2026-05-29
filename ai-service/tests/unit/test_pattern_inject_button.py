from app.skills.patterns.inject_button import InjectButtonPattern
from app.skills.dsl import ButtonDef


def _dsl(idempotent=False):
    return ButtonDef(
        component="CommentCard",
        label="Like",
        action_method="POST",
        action_path="/comments/:id/like",
        idempotent=idempotent,
    )


class TestInjectButtonPattern:
    def test_name(self):
        p = InjectButtonPattern()
        assert p.name == "inject_button"

    def test_plan_emits_button_render_and_api_call(self):
        p = InjectButtonPattern()
        actions = [s.action for s in p.plan(_dsl())]
        assert "inject_button_jsx" in actions
        assert "wire_api_call" in actions

    def test_idempotent_adds_disabled_state_step(self):
        p = InjectButtonPattern()
        actions = [s.action for s in p.plan(_dsl(idempotent=True))]
        assert "add_disabled_state" in actions

    def test_non_idempotent_no_disabled_state(self):
        p = InjectButtonPattern()
        actions = [s.action for s in p.plan(_dsl(idempotent=False))]
        assert "add_disabled_state" not in actions
