from app.skills.business.add_edited_time import AddEditedTimeSkill


class TestAddEditedTimeSkill:
    def test_metadata(self):
        s = AddEditedTimeSkill()
        assert s.name == "add_edited_time"
        assert "最后编辑" in s.trigger_keywords

    def test_match_chinese(self):
        s = AddEditedTimeSkill()
        assert s.match("文章详情页显示最后编辑时间") > 0.5
        assert s.match("加个编辑于多久前") > 0.5

    def test_match_unrelated(self):
        s = AddEditedTimeSkill()
        # 与 add_word_count 不串味
        assert s.match("加字数统计") < 0.5
        # 与 add_view_count 不串味
        assert s.match("加阅读量") < 0.5

    def test_plan_uses_relative_time_compute(self):
        s = AddEditedTimeSkill()
        computes = [
            st.dsl.get("compute")
            for st in s.plan({})
            if st.action == "inject_computed_display"
        ]
        assert "relative_time" in computes

    def test_source_field_is_updatedAt(self):
        s = AddEditedTimeSkill()
        for st in s.plan({}):
            if st.action == "inject_computed_display":
                assert st.dsl["source_field"] == "updatedAt"

    def test_no_backend_steps(self):
        # updatedAt 是 Sequelize 默认字段, 纯前端展示
        s = AddEditedTimeSkill()
        layers = {st.layer for st in s.plan({})}
        assert layers == {"frontend"}
