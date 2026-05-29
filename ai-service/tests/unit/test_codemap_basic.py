import pytest
from pydantic import ValidationError
from app.codemap.scanner import SymbolRef, CodeMap


class TestSymbolRef:
    def test_minimal(self):
        s = SymbolRef(file="backend/db/models/article.js", line=15)
        assert s.col == 0
        assert s.snippet is None

    def test_negative_line_rejected(self):
        with pytest.raises(ValidationError):
            SymbolRef(file="x.js", line=-1)


class TestCodeMap:
    def _mk(self):
        return CodeMap(
            repo_root="/tmp/conduit",
            generated_at=1716480000.0,
            models={"Article": SymbolRef(file="m/article.js", line=10)},
            routes={"GET /api/articles": SymbolRef(file="r/articles.js", line=4)},
            components={
                "ArticlePreview": SymbolRef(file="c/ArticlePreview.jsx", line=3)
            },
            hooks={},
            migrations_dir="backend/db/migrations",
            test_dir="tests",
        )

    def test_find_model(self):
        m = self._mk()
        assert m.find("models", "Article").file == "m/article.js"

    def test_find_unknown_kind_raises(self):
        m = self._mk()
        with pytest.raises(KeyError):
            m.find("widgets", "X")

    def test_find_unknown_name_raises(self):
        m = self._mk()
        with pytest.raises(KeyError):
            m.find("models", "NoSuchModel")

    def test_list_models(self):
        m = self._mk()
        assert m.list("models") == ["Article"]

    def test_list_empty_kind(self):
        m = self._mk()
        assert m.list("hooks") == []
