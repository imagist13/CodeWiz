"""文章草稿——L2.3。

组合 add_enum_status（status draft/published，默认过滤草稿）。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import Step
from app.skills.patterns.add_enum_status import (
    AddEnumStatusPattern,
    EnumStatusDef,
)


class AddArticleDraftSkill(BusinessSkill):
    name = "add_article_draft"
    description = "Article 加草稿/已发布状态 + 列表默认过滤草稿"
    trigger_keywords = ["草稿", "draft", "未发布", "暂存"]
    params_schema = {}

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        return AddEnumStatusPattern().plan(
            EnumStatusDef(
                model="Article",
                field_name="status",
                values=["draft", "published"],
                default="published",
            )
        )
