from app.skills.patterns.add_field_with_idempotency import (
    AddFieldWithIdempotencyPattern,
)
from app.skills.dsl import FieldDef


def _dsl():
    return FieldDef(
        model="Comment", field_name="likeCount", field_type="int", default=0
    )


class TestAddFieldWithIdempotencyPattern:
    def test_name(self):
        p = AddFieldWithIdempotencyPattern()
        assert p.name == "add_field_with_idempotency"

    def test_plan_includes_idempotency_table(self):
        p = AddFieldWithIdempotencyPattern()
        actions = [s.action for s in p.plan(_dsl())]
        # 在 add_field 8 步上多加 idempotency 关系表 migration + 路由幂等检查
        assert "gen_idempotency_table_migration" in actions
        assert "add_idempotency_check_middleware" in actions

    def test_plan_total_steps(self):
        p = AddFieldWithIdempotencyPattern()
        assert len(p.plan(_dsl())) == 10  # 8 + 2 idempotency-specific
