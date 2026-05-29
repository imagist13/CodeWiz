from app.skills.business.add_word_count import AddWordCountSkill


class TestAddWordCountSkill:
    def test_metadata(self):
        s = AddWordCountSkill()
        assert s.name == "add_word_count"
        assert "字数" in s.trigger_keywords

    def test_match(self):
        s = AddWordCountSkill()
        assert s.match("文章详情页显示字数") > 0.5
        assert s.match("加阅读时间统计") > 0.5
        assert s.match("加阅读量") < 0.5

    def test_plan_two_displays_word_and_time(self):
        s = AddWordCountSkill()
        steps = s.plan({})
        computes = [
            st.dsl.get("compute")
            for st in steps
            if st.action == "inject_computed_display"
        ]
        assert "word_count" in computes
        assert "reading_time_minutes" in computes

    def test_source_field_is_body(self):
        s = AddWordCountSkill()
        for st in s.plan({}):
            if st.action == "inject_computed_display":
                assert st.dsl["source_field"] == "body"

    def test_no_backend_steps(self):
        # 纯前端 Skill, 不动 model / migration / route
        s = AddWordCountSkill()
        layers = {st.layer for st in s.plan({})}
        assert layers == {"frontend"}
