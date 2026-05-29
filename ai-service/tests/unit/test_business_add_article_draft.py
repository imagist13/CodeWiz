from app.skills.business.add_article_draft import AddArticleDraftSkill


class TestAddArticleDraftSkill:
    def test_metadata(self):
        s = AddArticleDraftSkill()
        assert s.name == "add_article_draft"
        assert "草稿" in s.trigger_keywords

    def test_match(self):
        s = AddArticleDraftSkill()
        assert s.match("文章草稿功能") > 0.5
        assert s.match("加阅读量") < 0.5

    def test_plan_uses_enum_status_pattern(self):
        s = AddArticleDraftSkill()
        actions = [st.action for st in s.plan({})]
        assert "add_default_list_filter" in actions

    def test_status_values_include_draft_and_published(self):
        s = AddArticleDraftSkill()
        for st in s.plan({}):
            if st.action == "edit_sequelize_model":
                assert "draft" in st.dsl["values"]
                assert "published" in st.dsl["values"]
                assert st.dsl["default"] == "published"
