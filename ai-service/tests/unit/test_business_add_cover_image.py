from app.skills.business.add_cover_image import AddCoverImageSkill


class TestAddCoverImageSkill:
    def test_metadata(self):
        s = AddCoverImageSkill()
        assert s.name == "add_cover_image"
        assert "封面" in s.trigger_keywords

    def test_match(self):
        s = AddCoverImageSkill()
        assert s.match("文章加封面图") > 0.5
        assert s.match("加阅读量") < 0.5

    def test_plan_includes_form_input_and_display(self):
        s = AddCoverImageSkill()
        actions = [st.action for st in s.plan({})]
        assert "inject_form_input_jsx" in actions  # 编辑器输入框
        assert "inject_display" in actions  # 列表卡片显示

    def test_field_is_string_type(self):
        s = AddCoverImageSkill()
        for st in s.plan({}):
            if st.action == "edit_sequelize_model":
                assert st.dsl["field_type"] == "string"
                assert st.dsl["field_name"] == "coverImage"
