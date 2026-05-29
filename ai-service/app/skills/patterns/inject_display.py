"""往指定 React 组件的某个位置注入显示绑定。

仅一个 Step（前端），不动后端——业务 Skill 通常把它和 add_field 串起来。
"""

import uuid
from typing import List

from app.skills.base import PatternSkill
from app.skills.dsl import DisplayDef, Step


class InjectDisplayPattern(PatternSkill):
    name = "inject_display"
    description = "Inject a read-only display binding into a React component"
    target_symbols = [("components", "$component")]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: DisplayDef) -> List[Step]:
        return [
            Step(
                step_id=str(uuid.uuid4()),
                layer="frontend",
                action="inject_display",
                dsl=dsl.model_dump(),
                prompt_template="inject_display",
            )
        ]
