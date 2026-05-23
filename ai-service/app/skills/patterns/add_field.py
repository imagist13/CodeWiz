"""加字段：跨栈 8 步骤的核心 Pattern。

被 business/add_view_count, business/add_cover_image 等业务 Skill 复用。
每个 Step 共享同一份 FieldDef DSL 实例（序列化为 dict）保证跨栈一致性。
"""

import uuid
from typing import List

from app.skills.base import PatternSkill
from app.skills.dsl import FieldDef, Step


_ACTIONS = [
    # (action, layer, prompt_template_key)
    ("edit_sequelize_model", "backend", "add_field_model"),
    ("gen_migration", "backend", "add_field_migration"),
    ("update_route_response", "backend", "add_field_route_response"),
    ("add_jsdoc_typedef", "backend", "add_field_jsdoc"),
    ("update_mock_data", "frontend", "add_field_mock"),
    ("update_api_call", "frontend", "add_field_api_call"),
    ("inject_form_input", "frontend", "add_field_form_input"),
    ("gen_unit_test", "test", "add_field_unit_test"),
]


class AddFieldPattern(PatternSkill):
    name = "add_field"
    description = "Cross-stack add a field to Article/User/Comment/Tag"
    target_symbols = [
        ("models", "$model"),
        ("routes", "GET /api/$model_plural"),
        ("components", "ArticlePreview"),
        ("components", "Editor"),
    ]

    def match(self, intent: str) -> float:
        # Pattern 不参与 router 比赛（router 只选 Business）
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
