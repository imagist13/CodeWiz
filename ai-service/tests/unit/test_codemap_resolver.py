from pathlib import Path
import pytest

from app.codemap.scanner import scan_conduit
from app.skills.dsl import Step
from app.harness.codemap_resolver import CodeMapResolver, ResolveError


FIXTURE = Path(__file__).parent.parent / "fixtures" / "conduit_mini"


@pytest.fixture
def codemap():
    return scan_conduit(str(FIXTURE))


class TestCodeMapResolver:
    def test_resolves_model_step(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="backend",
            action="edit_sequelize_model",
            dsl={
                "model": "Article",
                "field_name": "viewCount",
                "field_type": "int",
                "default": 0,
            },
            prompt_template="add_field_model",
        )
        resolved = r.resolve(step)
        assert resolved.target_path == "backend/db/models/article.js"
        assert resolved.target_lines is not None

    def test_resolves_component_step_inject_display(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="frontend",
            action="inject_display",
            dsl={
                "component": "ArticlePreview",
                "binding": "viewCount",
                "position": "card_meta",
            },
            prompt_template="inject_display",
        )
        resolved = r.resolve(step)
        assert resolved.target_path.endswith("ArticlePreview.jsx")

    def test_resolves_component_for_computed_display(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="frontend",
            action="inject_computed_display",
            dsl={
                "component": "ArticleDetail",
                "source_field": "body",
                "compute": "word_count",
                "label_template": "{value} 字",
                "position": "detail_bottom",
            },
            prompt_template="computed_display_jsx",
        )
        resolved = r.resolve(step)
        assert resolved.target_path.endswith("ArticleDetail.jsx")

    def test_resolves_migration_action_uses_migrations_dir(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="backend",
            action="gen_migration",
            dsl={
                "model": "Article",
                "field_name": "viewCount",
                "field_type": "int",
                "default": 0,
            },
            prompt_template="add_field_migration",
        )
        resolved = r.resolve(step)
        # migration 是新文件, 给一个目录路径
        assert "migrations" in resolved.target_path

    def test_unknown_action_raises(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="backend",
            action="rebuild_kernel",
            dsl={},
            prompt_template="x",
        )
        with pytest.raises(ResolveError):
            r.resolve(step)

    def test_missing_symbol_raises(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="backend",
            action="edit_sequelize_model",
            dsl={
                "model": "Unicorn",
                "field_name": "x",
                "field_type": "int",
                "default": 0,
            },
            prompt_template="add_field_model",
        )
        with pytest.raises(ResolveError):
            r.resolve(step)

    def test_gen_migration_marks_new_file(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="backend",
            action="gen_migration",
            dsl={
                "model": "Article",
                "field_name": "viewCount",
                "field_type": "int",
                "default": 0,
            },
            prompt_template="add_field_migration",
        )
        resolved = r.resolve(step)
        assert resolved.is_new_file is True
        assert "migrations" in resolved.target_path

    def test_edit_existing_model_is_not_new_file(self, codemap):
        r = CodeMapResolver(codemap)
        step = Step(
            step_id="s1",
            layer="backend",
            action="edit_sequelize_model",
            dsl={
                "model": "Article",
                "field_name": "viewCount",
                "field_type": "int",
                "default": 0,
            },
            prompt_template="add_field_model",
        )
        resolved = r.resolve(step)
        assert resolved.is_new_file is False
