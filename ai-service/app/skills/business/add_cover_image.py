"""文章加封面图——L2.1。

组合 add_field（coverImage string） + inject_form_input（编辑器输入框）
+ inject_display（列表卡片显示）。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import FieldDef, DisplayDef, Step
from app.skills.patterns.add_field import AddFieldPattern
from app.skills.patterns.inject_form_input import (
    InjectFormInputPattern,
    FormInputDef,
)
from app.skills.patterns.inject_display import InjectDisplayPattern


class AddCoverImageSkill(BusinessSkill):
    name = "add_cover_image"
    description = "Article 加封面图 URL 字段、编辑器输入、列表卡片展示"
    trigger_keywords = ["封面", "封面图", "cover", "cover image", "缩略图"]
    params_schema = {}

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        return [
            *AddFieldPattern().plan(
                FieldDef(
                    model="Article",
                    field_name="coverImage",
                    field_type="string",
                    default="",
                )
            ),
            *InjectFormInputPattern().plan(
                FormInputDef(
                    component="Editor",
                    binding="coverImage",
                    input_type="url",
                    label="Cover Image URL",
                )
            ),
            *InjectDisplayPattern().plan(
                DisplayDef(
                    component="ArticlePreview",
                    binding="coverImage",
                    position="card_meta",
                )
            ),
        ]
