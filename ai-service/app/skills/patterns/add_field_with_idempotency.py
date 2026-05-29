"""带幂等性的加字段——用于点赞、收藏这类需要"同用户重复操作不累加"的场景。

在 add_field 基础上插入：
  - 关系表 migration（如 CommentLikes(user_id, comment_id, PK)）
  - 路由幂等检查中间件
"""

import uuid
from typing import List

from app.skills.base import PatternSkill
from app.skills.dsl import FieldDef, Step


_ACTIONS = [
    ("edit_sequelize_model", "backend", "add_field_model"),
    ("gen_migration", "backend", "add_field_migration"),
    ("gen_idempotency_table_migration", "backend", "add_field_idempotency_table"),
    ("update_route_response", "backend", "add_field_route_response"),
    ("add_idempotency_check_middleware", "backend", "add_field_idempotency_mw"),
    ("add_jsdoc_typedef", "backend", "add_field_jsdoc"),
    ("update_mock_data", "frontend", "add_field_mock"),
    ("update_api_call", "frontend", "add_field_api_call"),
    ("inject_form_input", "frontend", "add_field_form_input"),
    ("gen_unit_test", "test", "add_field_idempotent_test"),
]


class AddFieldWithIdempotencyPattern(PatternSkill):
    name = "add_field_with_idempotency"
    description = "Cross-stack add a counter field with idempotency guard"
    target_symbols = [
        ("models", "$model"),
        ("routes", "POST /api/$model_plural/:id"),
    ]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: FieldDef) -> List[Step]:
        payload = dsl.model_dump()
        return [
            Step(
                step_id=str(uuid.uuid4()),
                layer=layer,
                action=action,
                dsl=payload,
                prompt_template=tpl,
            )
            for action, layer, tpl in _ACTIONS
        ]
