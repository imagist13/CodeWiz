from app.skills.patterns.add_enum_status import (
    AddEnumStatusPattern,
    EnumStatusDef,
)


def _dsl():
    return EnumStatusDef(
        model="Article",
        field_name="status",
        values=["draft", "published"],
        default="published",
    )


class TestAddEnumStatusPattern:
    def test_name(self):
        p = AddEnumStatusPattern()
        assert p.name == "add_enum_status"

    def test_dsl_validates_values_non_empty(self):
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            EnumStatusDef(model="Article", field_name="status", values=[], default="x")

    def test_dsl_validates_default_in_values(self):
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            EnumStatusDef(
                model="Article", field_name="status", values=["a", "b"], default="c"
            )

    def test_plan_includes_list_filter_step(self):
        p = AddEnumStatusPattern()
        actions = [s.action for s in p.plan(_dsl())]
        assert "add_default_list_filter" in actions  # 默认过滤草稿

    def test_plan_step_count(self):
        p = AddEnumStatusPattern()
        assert len(p.plan(_dsl())) == 7
