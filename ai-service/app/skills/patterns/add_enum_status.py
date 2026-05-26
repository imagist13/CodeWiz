"""加枚举状态字段——用于 Article.status (draft/published) 这类。

特殊点：除了字段本身，还要在列表查询里加默认过滤（drafts 不进首页）。
"""

import uuid
from typing import List, Literal
from pydantic import BaseModel, model_validator

from app.skills.base import PatternSkill
from app.skills.dsl import Step


class EnumStatusDef(BaseModel):
    model: Literal["Article", "User", "Comment", "Tag"]
    field_name: str
    values: List[str]
    default: str

    @model_validator(mode="after")
    def _validate(self):
        if not self.values:
            raise ValueError("values must be non-empty")
        if self.default not in self.values:
            raise ValueError(f"default {self.default!r} not in values")
        return self


_ACTIONS = [
    ("edit_sequelize_model", "backend", "add_enum_model"),
    ("gen_migration", "backend", "add_enum_migration"),
    ("add_default_list_filter", "backend", "add_enum_list_filter"),
    ("update_route_response", "backend", "add_field_route_response"),
    ("update_api_call", "frontend", "add_field_api_call"),
    ("inject_status_selector", "frontend", "add_enum_selector"),
    ("gen_unit_test", "test", "add_enum_unit_test"),
]


class AddEnumStatusPattern(PatternSkill):
    name = "add_enum_status"
    description = "Cross-stack add an enum status field with default list filter"
    target_symbols = [
        ("models", "$model"),
        ("routes", "GET /api/$model_plural"),
    ]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: EnumStatusDef) -> List[Step]:
        base = dsl.model_dump()
        steps: List[Step] = []
        for action, layer, tpl in _ACTIONS:
            step_dsl = dict(base)
            if action == "inject_status_selector":
                step_dsl["component"] = "Editor"
            steps.append(
                Step(
                    step_id=str(uuid.uuid4()),
                    layer=layer,
                    action=action,
                    dsl=step_dsl,
                    prompt_template=tpl,
                )
            )
        return steps
