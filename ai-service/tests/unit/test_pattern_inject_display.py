from app.skills.patterns.inject_display import InjectDisplayPattern
from app.skills.dsl import DisplayDef


class TestInjectDisplayPattern:
    def test_name(self):
        p = InjectDisplayPattern()
        assert p.name == "inject_display"

    def test_plan_emits_single_frontend_step(self):
        p = InjectDisplayPattern()
        steps = p.plan(
            DisplayDef(component="ArticlePreview", binding="viewCount", icon="👁")
        )
        assert len(steps) == 1
        assert steps[0].layer == "frontend"
        assert steps[0].action == "inject_display"

    def test_dsl_passthrough(self):
        p = InjectDisplayPattern()
        steps = p.plan(DisplayDef(component="X", binding="y"))
        assert steps[0].dsl["component"] == "X"
        assert steps[0].dsl["binding"] == "y"
