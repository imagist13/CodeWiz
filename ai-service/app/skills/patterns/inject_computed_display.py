"""基于已有字段在前端实时计算并展示——不动后端、不动数据模型。

适用：字数统计、预计阅读时间、最后编辑相对时间等"计算 + 展示"场景。

与 inject_display 的差别：
  - inject_display.binding 是字段名, 渲染 {article.<binding>}
  - inject_computed_display.compute 是计算名, 渲染 {<compute>(article.<source>)}

step_executor 拿到 compute 后用预制工具函数（utils/text.js 等）实现，
LLM 只在 component 里插入一行 JSX, 不发明算法。
"""

import uuid
from typing import List, Literal
from pydantic import BaseModel, model_validator

from app.skills.base import PatternSkill
from app.skills.dsl import Step


_COMPUTE_KINDS = Literal[
    "word_count",  # body.split(/\s+/).filter(Boolean).length
    "char_count",  # body.length
    "reading_time_minutes",  # Math.ceil(word_count / 200)
    "relative_time",  # dayjs(field).fromNow()
    "truncate",  # field.slice(0, 100) + "..."
]


class ComputedDisplayDef(BaseModel):
    component: str
    source_field: str  # 已存在的 model 字段名, 如 "body" / "updatedAt"
    compute: _COMPUTE_KINDS
    label_template: str  # 必须含 {value} 占位, 如 "本文共 {value} 字"
    position: Literal["card_meta", "detail_top", "detail_bottom", "sidebar"] = (
        "detail_bottom"
    )

    @model_validator(mode="after")
    def _validate_template(self):
        if "{value}" not in self.label_template:
            raise ValueError("label_template must contain '{value}' placeholder")
        return self


_ACTIONS = [
    ("add_compute_util", "frontend", "computed_display_util"),
    ("inject_computed_display", "frontend", "computed_display_jsx"),
]


class InjectComputedDisplayPattern(PatternSkill):
    name = "inject_computed_display"
    description = "Inject a computed value derived from an existing field"
    target_symbols = [("components", "$component")]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: ComputedDisplayDef) -> List[Step]:
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
