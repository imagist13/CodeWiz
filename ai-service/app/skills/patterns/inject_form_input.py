"""往编辑器组件注入一个表单输入框，绑定到 state。

被 add_cover_image 等业务 Skill 用来给 Editor 添加输入字段。
"""

import uuid
from typing import List, Literal
from pydantic import BaseModel

from app.skills.base import PatternSkill
from app.skills.dsl import Step


class FormInputDef(BaseModel):
    component: str
    binding: str
    input_type: Literal["text", "textarea", "number", "url", "checkbox"]
    label: str


class InjectFormInputPattern(PatternSkill):
    name = "inject_form_input"
    description = "Inject a form input + state binding into an editor component"
    target_symbols = [("components", "$component")]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: FormInputDef) -> List[Step]:
        payload = dsl.model_dump()
        return [
            Step(
                step_id=str(uuid.uuid4()),
                layer="frontend",
                action="inject_form_input_jsx",
                dsl=payload,
                prompt_template="inject_form_input_jsx",
            ),
            Step(
                step_id=str(uuid.uuid4()),
                layer="frontend",
                action="wire_state_setter",
                dsl=payload,
                prompt_template="inject_form_input_state",
            ),
        ]
