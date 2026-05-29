from app.skills.business.add_about_me_tab import AddAboutMeTabSkill


class TestAddAboutMeTabSkill:
    def test_metadata(self):
        s = AddAboutMeTabSkill()
        assert s.name == "add_about_me_tab"
        assert any(
            k.lower() in [t.lower() for t in s.trigger_keywords]
            for k in ["about me", "bio"]
        )

    def test_match_chinese_intent(self):
        s = AddAboutMeTabSkill()
        assert s.match("个人主页新增 about me tab 显示 bio") > 0.5
        assert s.match("Profile 页加个关于我 tab") > 0.5

    def test_match_english_intent(self):
        s = AddAboutMeTabSkill()
        assert s.match("add About Me tab to profile page") > 0.5

    def test_match_unrelated(self):
        s = AddAboutMeTabSkill()
        assert s.match("文章加封面图") < 0.5

    def test_plan_has_single_tab_step(self):
        s = AddAboutMeTabSkill()
        steps = s.plan({})
        assert len(steps) == 1
        assert steps[0].action == "add_page_tab"
        assert steps[0].layer == "frontend"

    def test_plan_dsl_defaults(self):
        s = AddAboutMeTabSkill()
        step = s.plan({})[0]
        assert step.dsl["page_component"] == "Profile"
        assert step.dsl["tab_id"] == "about_me"
        assert step.dsl["tab_label"] == "About Me"
        assert step.dsl["content_binding"] == "user.bio"

    def test_plan_label_override(self):
        s = AddAboutMeTabSkill()
        step = s.plan({"tab_label": "关于我"})[0]
        assert step.dsl["tab_label"] == "关于我"
