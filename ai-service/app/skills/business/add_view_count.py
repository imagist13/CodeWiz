"""加阅读量——L1.1 魔改首炷题。

组合 add_field（int 字段 viewCount） + inject_display（首页卡片显示）。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import FieldDef, DisplayDef, Step
from app.skills.patterns.add_field import AddFieldPattern
from app.skills.patterns.inject_display import InjectDisplayPattern


class AddViewCountSkill(BusinessSkill):
    name = "add_view_count"
    description = "为 Article 加阅读量统计字段并在卡片显示"
    trigger_keywords = ["阅读量", "浏览量", "view", "view count", "pv", "热度"]
    params_schema = {
        "default": {
            "type": "int",
            "required": False,
            "default": 0,
            "doc": "viewCount 初始值",
        },
    }

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        default = params.get("default", 0)
        return [
            *AddFieldPattern().plan(
                FieldDef(
                    model="Article",
                    field_name="viewCount",
                    field_type="int",
                    default=default,
                )
            ),
            *InjectDisplayPattern().plan(
                DisplayDef(
                    component="ArticlePreview",
                    binding="viewCount",
                    icon="👁",
                    position="card_meta",
                )
            ),
        ]
