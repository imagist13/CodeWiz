"""给已有 Tab 容器组件加一个新 Tab (label + content) — 纯前端单 step。"""

import uuid
from typing import List

from app.skills.base import PatternSkill
from app.skills.dsl import PageTabDef, Step


class AddPageTabPattern(PatternSkill):
    name = "add_page_tab"
    description = "Inject a new Tab item + content panel into a React Tab container"
    target_symbols = [("components", "$page_component")]

    def match(self, intent: str) -> float:
        return 0.0

    def plan(self, dsl: PageTabDef) -> List[Step]:
        return [
            Step(
                step_id=str(uuid.uuid4()),
                layer="frontend",
                action="add_page_tab",
                dsl=dsl.model_dump(),
                prompt_template="add_page_tab",
            )
        ]
