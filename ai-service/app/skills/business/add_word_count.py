"""文章字数 + 预计阅读时间——L1.4 题，纯前端计算。

组合两个 inject_computed_display：
  - 基于 body 算字数
  - 基于字数 / 200 算阅读分钟数
不动后端，不加字段。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import Step
from app.skills.patterns.inject_computed_display import (
    InjectComputedDisplayPattern,
    ComputedDisplayDef,
)


class AddWordCountSkill(BusinessSkill):
    name = "add_word_count"
    description = "文章详情页显示字数 + 预计阅读时间（前端基于 body 计算）"
    trigger_keywords = [
        "字数",
        "字符数",
        "阅读时间",
        "阅读分钟",
        "word count",
        "reading time",
    ]
    params_schema = {}

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        pattern = InjectComputedDisplayPattern()
        return [
            *pattern.plan(
                ComputedDisplayDef(
                    component="ArticleDetail",
                    source_field="body",
                    compute="word_count",
                    label_template="本文共 {value} 字",
                    position="detail_bottom",
                )
            ),
            *pattern.plan(
                ComputedDisplayDef(
                    component="ArticleDetail",
                    source_field="body",
                    compute="reading_time_minutes",
                    label_template="预计阅读 {value} 分钟",
                    position="detail_bottom",
                )
            ),
        ]
