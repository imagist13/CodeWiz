import pytest
from app.agents.skill_router import SkillRouter
from app.skills.registry import SkillRegistry


@pytest.fixture
def real_registry():
    return SkillRegistry.discover("app.skills")


class TestSkillRouter:
    def test_routes_viewcount(self, real_registry):
        router = SkillRouter(real_registry)
        r = router.route("给文章加阅读量")
        assert r.top1.skill_name == "add_view_count"
        assert r.top1.confidence > 0.5

    def test_routes_comment_like(self, real_registry):
        router = SkillRouter(real_registry)
        r = router.route("评论加点赞")
        assert r.top1.skill_name == "add_comment_like"

    def test_routes_cover_image(self, real_registry):
        router = SkillRouter(real_registry)
        r = router.route("文章加封面图")
        assert r.top1.skill_name == "add_cover_image"

    def test_routes_draft(self, real_registry):
        router = SkillRouter(real_registry)
        r = router.route("文章草稿功能")
        assert r.top1.skill_name == "add_article_draft"

    def test_low_confidence_when_no_match(self, real_registry):
        router = SkillRouter(real_registry)
        r = router.route("帮我配置 nginx")
        assert r.top1.confidence < 0.5

    def test_returns_top3(self, real_registry):
        router = SkillRouter(real_registry)
        r = router.route("给文章加阅读量")
        assert len(r.candidates) >= 1
        assert len(r.candidates) <= 3

    def test_candidates_sorted_desc(self, real_registry):
        router = SkillRouter(real_registry)
        r = router.route("给文章加阅读量")
        conf = [c.confidence for c in r.candidates]
        assert conf == sorted(conf, reverse=True)
