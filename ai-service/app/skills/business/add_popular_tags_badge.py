"""Popular Tags 侧边栏前 5 打标——L1.2 公开题。

纯前端: 给现有 Sidebar / Tags 列表前 N 个加视觉 badge, 不引入排序语义。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import ListBadgeDef, Step
from app.skills.patterns.inject_list_badge import InjectListBadgePattern


class AddPopularTagsBadgeSkill(BusinessSkill):
    name = "add_popular_tags_badge"
    description = "给标签侧边栏前 N 个 tag 加视觉 badge (popular/featured)"
    trigger_keywords = [
        "前 5",
        "前5",
        "前五",
        "top 5",
        "top5",
        "popular",
        "打标",
        "标识",
        "热门标签",
        "popular tags",
        "前 n",
    ]
    params_schema = {
        "limit": {
            "type": "int",
            "required": False,
            "default": 5,
            "doc": "打标 item 数",
        },
        "badge_label": {
            "type": "string",
            "required": False,
            "default": "Top",
            "doc": "badge 显示文字",
        },
    }

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        limit = int(params.get("limit", 5))
        label = params.get("badge_label", "Top")
        return InjectListBadgePattern().plan(
            ListBadgeDef(
                component="Sidebar",
                list_binding="tags",
                limit=limit,
                badge_label=label,
            )
        )
