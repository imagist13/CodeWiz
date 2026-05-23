import pytest
from pydantic import ValidationError

from app.skills.patterns.inject_computed_display import (
    InjectComputedDisplayPattern,
    ComputedDisplayDef,
)


class TestComputedDisplayDef:
    def test_minimal_valid(self):
        d = ComputedDisplayDef(
            component="ArticleDetail",
            source_field="body",
            compute="word_count",
            label_template="本文共 {value} 字",
        )
        assert d.position == "detail_bottom"  # default

    def test_compute_enum(self):
        with pytest.raises(ValidationError):
            ComputedDisplayDef(
                component="X",
                source_field="body",
                compute="md5",
                label_template="{value}",
            )

    def test_label_template_must_contain_value(self):
        with pytest.raises(ValidationError):
            ComputedDisplayDef(
                component="X",
                source_field="body",
                compute="word_count",
                label_template="no placeholder",
            )


class TestInjectComputedDisplayPattern:
    def test_name(self):
        p = InjectComputedDisplayPattern()
        assert p.name == "inject_computed_display"

    def test_target_symbols(self):
        p = InjectComputedDisplayPattern()
        assert ("components", "$component") in p.target_symbols

    def test_plan_emits_two_steps(self):
        p = InjectComputedDisplayPattern()
        steps = p.plan(
            ComputedDisplayDef(
                component="ArticleDetail",
                source_field="body",
                compute="word_count",
                label_template="本文共 {value} 字",
            )
        )
        actions = [s.action for s in steps]
        assert "add_compute_util" in actions  # 抽到 utils 里
        assert "inject_computed_display" in actions  # 组件里渲染

    def test_all_steps_frontend(self):
        p = InjectComputedDisplayPattern()
        steps = p.plan(
            ComputedDisplayDef(
                component="X",
                source_field="body",
                compute="word_count",
                label_template="{value} 字",
            )
        )
        assert all(s.layer == "frontend" for s in steps)

    def test_dsl_passthrough(self):
        p = InjectComputedDisplayPattern()
        dsl = ComputedDisplayDef(
            component="ArticleDetail",
            source_field="body",
            compute="reading_time_minutes",
            label_template="预计阅读 {value} 分钟",
        )
        for s in p.plan(dsl):
            assert s.dsl["source_field"] == "body"
            assert s.dsl["compute"] == "reading_time_minutes"
