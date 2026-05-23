"""最后编辑时间展示——L2.4 题。

Article.updatedAt 是 Sequelize 默认字段，每次 update 自动刷新，
本 Skill 只在前端基于 updatedAt 用 dayjs.fromNow() 渲染相对时间。
零后端改动。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import Step
from app.skills.patterns.inject_computed_display import (
    InjectComputedDisplayPattern,
    ComputedDisplayDef,
)


class AddEditedTimeSkill(BusinessSkill):
    name = "add_edited_time"
    description = "文章详情页显示「最后编辑于 X 小时前」"
    trigger_keywords = [
        "最后编辑",
        "编辑时间",
        "更新时间",
        "编辑于",
        "edited",
        "last edited",
    ]
    params_schema = {}

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        return InjectComputedDisplayPattern().plan(
            ComputedDisplayDef(
                component="ArticleDetail",
                source_field="updatedAt",
                compute="relative_time",
                label_template="最后编辑于 {value}",
                position="detail_top",
            )
        )
