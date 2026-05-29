from app.skills.business.add_comment_like import AddCommentLikeSkill


class TestAddCommentLikeSkill:
    def test_metadata(self):
        s = AddCommentLikeSkill()
        assert s.name == "add_comment_like"
        assert "点赞" in s.trigger_keywords

    def test_match_chinese(self):
        s = AddCommentLikeSkill()
        assert s.match("评论加点赞") > 0.5

    def test_match_unrelated(self):
        s = AddCommentLikeSkill()
        assert s.match("加阅读量") < 0.5

    def test_plan_uses_idempotent_pattern(self):
        s = AddCommentLikeSkill()
        actions = [st.action for st in s.plan({})]
        assert "gen_idempotency_table_migration" in actions
        assert "add_idempotency_check_middleware" in actions

    def test_plan_injects_idempotent_button(self):
        s = AddCommentLikeSkill()
        actions = [st.action for st in s.plan({})]
        assert "add_disabled_state" in actions  # InjectButton idempotent=True

    def test_target_is_comment(self):
        s = AddCommentLikeSkill()
        for st in s.plan({}):
            if st.action == "edit_sequelize_model":
                assert st.dsl["model"] == "Comment"
                assert st.dsl["field_name"] == "likeCount"
