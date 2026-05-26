"""往列表前 N 个 item 注入条件渲染 badge (e.g. Popular Tags 前 5 加标识)。

单 step (前端), 不动后端。
"""

import uuid
from typing import List

from app.skills.base import PatternSkill
from app.skills.dsl import ListBadgeDef, Step


class InjectListBadgePattern(PatternSkill):
    name = "inject_list_badge"
    description = "Inject a conditional badge onto the first N items of a list in a React component"
    target_symbols = [("components", "$component")]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: ListBadgeDef) -> List[Step]:
        return [
            Step(
                step_id=str(uuid.uuid4()),
                layer="frontend",
                action="inject_list_badge",
                dsl=dsl.model_dump(),
                prompt_template="inject_list_badge",
            )
        ]
