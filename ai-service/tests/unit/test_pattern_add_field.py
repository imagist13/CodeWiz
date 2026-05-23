from app.skills.patterns.add_field import AddFieldPattern
from app.skills.dsl import FieldDef


def _dsl():
    return FieldDef(
        model="Article", field_name="viewCount", field_type="int", default=0
    )


class TestAddFieldPattern:
    def test_name_and_class_vars(self):
        p = AddFieldPattern()
        assert p.name == "add_field"
        assert ("models", "$model") in p.target_symbols
        assert ("components", "ArticlePreview") in p.target_symbols

    def test_plan_step_count(self):
        p = AddFieldPattern()
        steps = p.plan(_dsl())
        assert len(steps) == 8  # 4 backend + 3 frontend + 1 test

    def test_plan_step_actions(self):
        p = AddFieldPattern()
        actions = [s.action for s in p.plan(_dsl())]
        assert actions == [
            "edit_sequelize_model",
            "gen_migration",
            "update_route_response",
            "add_jsdoc_typedef",
            "update_mock_data",
            "update_api_call",
            "inject_form_input",
            "gen_unit_test",
        ]

    def test_plan_layers(self):
        p = AddFieldPattern()
        layers = [s.layer for s in p.plan(_dsl())]
        assert layers == [
            "backend",
            "backend",
            "backend",
            "backend",
            "frontend",
            "frontend",
            "frontend",
            "test",
        ]

    def test_plan_dsl_passthrough(self):
        p = AddFieldPattern()
        dsl = _dsl()
        for s in p.plan(dsl):
            assert s.dsl["field_name"] == "viewCount"
            assert s.dsl["model"] == "Article"

    def test_plan_step_ids_unique(self):
        p = AddFieldPattern()
        ids = [s.step_id for s in p.plan(_dsl())]
        assert len(set(ids)) == len(ids)

    def test_plan_prompt_templates_set(self):
        p = AddFieldPattern()
        for s in p.plan(_dsl()):
            assert s.prompt_template != ""
