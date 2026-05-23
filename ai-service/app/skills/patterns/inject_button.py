"""往组件注入一个按钮 + 接通到 API。

幂等模式下额外增加"已点击禁用"前端状态。
"""

import uuid
from typing import List

from app.skills.base import PatternSkill
from app.skills.dsl import ButtonDef, Step


class InjectButtonPattern(PatternSkill):
    name = "inject_button"
    description = "Inject a button into a React component + wire it to an API"
    target_symbols = [("components", "$component")]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: ButtonDef) -> List[Step]:
        payload = dsl.model_dump()
        steps = [
            Step(
                step_id=str(uuid.uuid4()),
                layer="frontend",
                action="inject_button_jsx",
                dsl=payload,
                prompt_template="inject_button_jsx",
            ),
            Step(
                step_id=str(uuid.uuid4()),
                layer="frontend",
                action="wire_api_call",
                dsl=payload,
                prompt_template="inject_button_api_call",
            ),
        ]
        if dsl.idempotent:
            steps.append(
                Step(
                    step_id=str(uuid.uuid4()),
                    layer="frontend",
                    action="add_disabled_state",
                    dsl=payload,
                    prompt_template="inject_button_disabled",
                )
            )
        return steps
