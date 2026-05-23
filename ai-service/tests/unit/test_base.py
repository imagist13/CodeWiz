import pytest
from app.skills.base import Skill, BusinessSkill, PatternSkill
from app.skills.dsl import Step, FieldDef


class TestSkillAbstract:
    def test_cannot_instantiate_abstract_skill(self):
        with pytest.raises(TypeError):
            Skill()  # ABC


class TestBusinessSkillContract:
    def test_subclass_must_define_required_classvars(self):
        # 缺 name / description / trigger_keywords / params_schema 应该 fail
        class Incomplete(BusinessSkill):
            def match(self, intent):
                return 0.0

            def plan(self, params):
                return []

        with pytest.raises(AttributeError):
            _ = Incomplete.name  # noqa

    def test_complete_subclass_instantiable(self):
        class AddX(BusinessSkill):
            name = "add_x"
            description = "Add X"
            trigger_keywords = ["x", "ex"]
            params_schema = {"target": "str"}

            def match(self, intent: str) -> float:
                hits = sum(1 for kw in self.trigger_keywords if kw in intent)
                return min(hits / 2.0, 1.0)

            def plan(self, params: dict):
                return []

        skill = AddX()
        assert skill.name == "add_x"
        assert skill.match("add an ex thing") == 1.0
        assert skill.match("nothing matches here") == 0.0
        assert skill.plan({}) == []


class TestPatternSkillContract:
    def test_complete_subclass_instantiable(self):
        class AddFieldPattern(PatternSkill):
            name = "add_field"
            description = "Cross-stack add a field"
            target_symbols = [("models", "$model")]

            def match(self, intent: str) -> float:
                return 0.0  # Patterns 不参与 router 比赛, 默认 0

            def plan(self, dsl: FieldDef):
                return [
                    Step(
                        step_id="s1",
                        layer="backend",
                        action="edit_model",
                        dsl=dsl.model_dump(),
                        prompt_template="add_field_model",
                    )
                ]

        p = AddFieldPattern()
        out = p.plan(
            FieldDef(model="Article", field_name="x", field_type="int", default=0)
        )
        assert len(out) == 1
        assert out[0].action == "edit_model"
