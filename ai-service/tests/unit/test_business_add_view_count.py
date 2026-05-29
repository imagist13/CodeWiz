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

    # --- v3 新路径: contract_l1a / contract_l1b ---

    def test_contract_l1a_frontend_only(self):
        s = AddViewCountSkill()
        c = s.contract_l1a()
        assert "viewCount" in c.goal
        assert any("frontend" in x for x in c.constraints)
        assert any("不实现真实递增" in x for x in c.forbid)
        # 至少 3 个 acceptance: GrepInDir + FileContains + ForbidContains
        assert len(c.acceptance) >= 3

    def test_contract_l1a_forbids_editor_path(self):
        """v2.1 R-3: ForbidContains 必须指向真实 Conduit 编辑器路径."""
        from app.skills.acceptance import ForbidContains

        s = AddViewCountSkill()
        c = s.contract_l1a()
        forbid_paths = [a.path for a in c.acceptance if isinstance(a, ForbidContains)]
        assert any("ArticleEditorForm" in p for p in forbid_paths)

    def test_contract_l1b_includes_migration_acceptance(self):
        """v2.1 R-4: L1-B goal 说 model+migration+controller, acceptance 必须覆盖 migration."""
        from app.skills.acceptance import GrepInDir

        s = AddViewCountSkill()
        c = s.contract_l1b()
        grep_dirs = [a.dir for a in c.acceptance if isinstance(a, GrepInDir)]
        assert any("backend/models" in d for d in grep_dirs)
        assert any("backend/migrations" in d for d in grep_dirs)
        assert any("backend/controllers" in d for d in grep_dirs)
        assert any("frontend/src" in d for d in grep_dirs)

    def test_contract_default_returns_l1a(self):
        s = AddViewCountSkill()
        assert s.contract({}).goal == s.contract_l1a().goal

    def test_other_skill_contract_returns_none(self):
        """旧 Skill 没 override contract() 必须返 None (走旧 plan 路径)."""
        from app.skills.business.add_about_me_tab import AddAboutMeTabSkill

        assert AddAboutMeTabSkill().contract({}) is None
