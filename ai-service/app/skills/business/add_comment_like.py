"""评论点赞——L2.2。

组合 add_field_with_idempotency（likeCount + 幂等关系表） +
inject_button（按钮 + 点击 disable）。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import FieldDef, ButtonDef, Step
from app.skills.patterns.add_field_with_idempotency import (
    AddFieldWithIdempotencyPattern,
)
from app.skills.patterns.inject_button import InjectButtonPattern


class AddCommentLikeSkill(BusinessSkill):
    name = "add_comment_like"
    description = "为 Comment 加点赞数字段 + 幂等按钮"
    trigger_keywords = ["点赞", "like", "赞数", "thumbs up"]
    params_schema = {}

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        return [
            *AddFieldWithIdempotencyPattern().plan(
                FieldDef(
                    model="Comment",
                    field_name="likeCount",
                    field_type="int",
                    default=0,
                )
            ),
            *InjectButtonPattern().plan(
                ButtonDef(
                    component="CommentCard",
                    label="Like",
                    action_method="POST",
                    action_path="/api/comments/:id/like",
                    idempotent=True,
                )
            ),
        ]
