from pathlib import Path
import pytest
from app.codemap.scanner import scan_conduit, CodeMap


FIXTURE = Path(__file__).parent.parent / "fixtures" / "conduit_mini"


class TestScanConduit:
    def test_returns_codemap(self):
        cm = scan_conduit(str(FIXTURE))
        assert isinstance(cm, CodeMap)
        assert cm.repo_root == str(FIXTURE)

    def test_finds_article_model(self):
        cm = scan_conduit(str(FIXTURE))
        ref = cm.find("models", "Article")
        assert ref.file == "backend/db/models/article.js"
        assert ref.line > 0

    def test_finds_comment_model(self):
        cm = scan_conduit(str(FIXTURE))
        assert "Comment" in cm.list("models")

    def test_finds_routes(self):
        cm = scan_conduit(str(FIXTURE))
        routes = cm.list("routes")
        assert "GET /api/articles" in routes
        assert "POST /api/articles" in routes

    def test_finds_components(self):
        cm = scan_conduit(str(FIXTURE))
        comps = cm.list("components")
        assert "ArticlePreview" in comps
        assert "Editor" in comps
        assert "ArticleDetail" in comps  # 给 add_word_count / add_edited_time
        assert "CommentCard" in comps  # 给 add_comment_like

    def test_migrations_dir_resolved(self):
        cm = scan_conduit(str(FIXTURE))
        assert cm.migrations_dir.endswith("backend/db/migrations")

    def test_unknown_repo_raises(self):
        with pytest.raises(FileNotFoundError):
            scan_conduit("/tmp/this-does-not-exist-12345")
