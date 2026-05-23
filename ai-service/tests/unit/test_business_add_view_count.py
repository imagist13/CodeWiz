from app.skills.business.add_view_count import AddViewCountSkill


class TestAddViewCountSkill:
    def test_metadata(self):
        s = AddViewCountSkill()
        assert s.name == "add_view_count"
        assert "阅读量" in s.trigger_keywords
        assert "viewCount" in str(s.params_schema)

    def test_match_chinese_intent(self):
        s = AddViewCountSkill()
        assert s.match("给文章加阅读量") > 0.5
        assert s.match("文章详情页显示浏览量") > 0.5

    def test_match_english_intent(self):
        s = AddViewCountSkill()
        assert s.match("add view count to article") > 0.5

    def test_match_unrelated_intent(self):
        s = AddViewCountSkill()
        assert s.match("加一个评论点赞功能") < 0.5

    def test_plan_includes_add_field_and_inject_display(self):
        s = AddViewCountSkill()
        steps = s.plan({"default": 0})
        actions = [step.action for step in steps]
        assert "edit_sequelize_model" in actions  # from add_field
        assert "inject_display" in actions  # from inject_display

    def test_plan_field_name_is_viewCount(self):
        s = AddViewCountSkill()
        for step in s.plan({"default": 0}):
            if step.action == "edit_sequelize_model":
                assert step.dsl["field_name"] == "viewCount"
                assert step.dsl["model"] == "Article"
                assert step.dsl["field_type"] == "int"

    def test_plan_default_can_be_overridden(self):
        s = AddViewCountSkill()
        for step in s.plan({"default": 100}):
            if step.action == "edit_sequelize_model":
                assert step.dsl["default"] == 100
