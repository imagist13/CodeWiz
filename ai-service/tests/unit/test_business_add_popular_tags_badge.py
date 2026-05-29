from app.skills.business.add_popular_tags_badge import AddPopularTagsBadgeSkill


class TestAddPopularTagsBadgeSkill:
    def test_metadata(self):
        s = AddPopularTagsBadgeSkill()
        assert s.name == "add_popular_tags_badge"
        assert any(k in s.trigger_keywords for k in ["前 5", "popular"])

    def test_match_chinese_intent(self):
        s = AddPopularTagsBadgeSkill()
        assert s.match("给侧边栏 popular tags 前 5 个打标") > 0.5
        assert s.match("前五个 tag 加个标识") > 0.5

    def test_match_english_intent(self):
        s = AddPopularTagsBadgeSkill()
        assert s.match("badge the top 5 popular tags") > 0.5

    def test_match_unrelated(self):
        s = AddPopularTagsBadgeSkill()
        assert s.match("给文章加阅读量") < 0.5

    def test_plan_has_single_inject_step(self):
        s = AddPopularTagsBadgeSkill()
        steps = s.plan({})
        assert len(steps) == 1
        assert steps[0].action == "inject_list_badge"
        assert steps[0].layer == "frontend"

    def test_plan_default_limit_is_5(self):
        s = AddPopularTagsBadgeSkill()
        step = s.plan({})[0]
        assert step.dsl["limit"] == 5
        assert step.dsl["component"] == "Sidebar"
        assert step.dsl["list_binding"] == "tags"

    def test_plan_limit_override(self):
        s = AddPopularTagsBadgeSkill()
        step = s.plan({"limit": 3, "badge_label": "Hot"})[0]
        assert step.dsl["limit"] == 3
        assert step.dsl["badge_label"] == "Hot"
