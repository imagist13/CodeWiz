from app.skills.patterns.inject_form_input import (
    InjectFormInputPattern,
    FormInputDef,
)


class TestInjectFormInputPattern:
    def test_name(self):
        p = InjectFormInputPattern()
        assert p.name == "inject_form_input"

    def test_plan_emits_two_steps(self):
        p = InjectFormInputPattern()
        dsl = FormInputDef(
            component="Editor",
            binding="coverImage",
            input_type="text",
            label="Cover Image URL",
        )
        steps = p.plan(dsl)
        actions = [s.action for s in steps]
        assert "inject_form_input_jsx" in actions
        assert "wire_state_setter" in actions

    def test_dsl_input_type_enum(self):
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            FormInputDef(component="X", binding="y", input_type="weird", label="L")
