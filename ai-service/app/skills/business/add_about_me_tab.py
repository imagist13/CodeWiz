"""个人主页 About Me Tab——L1.3 公开题。

在 Profile 页现有 My Articles / Favorited Articles tab 之外加 About Me tab,
展示 user.bio。纯前端单 step。
"""

from typing import List

from app.skills.base import BusinessSkill
from app.skills.dsl import PageTabDef, Step
from app.skills.patterns.add_page_tab import AddPageTabPattern


class AddAboutMeTabSkill(BusinessSkill):
    name = "add_about_me_tab"
    description = "Profile 页加 About Me tab 展示 user.bio"
    trigger_keywords = [
        "about me",
        "关于我",
        "个人简介",
        "profile tab",
        "新增 tab",
        "新增一个 tab",
        "新 tab",
        "tab",
        "bio",
    ]
    params_schema = {
        "tab_label": {
            "type": "string",
            "required": False,
            "default": "About Me",
            "doc": "tab 显示文字",
        },
    }

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        label = params.get("tab_label", "About Me")
        return AddPageTabPattern().plan(
            PageTabDef(
                page_component="Profile",
                tab_id="about_me",
                tab_label=label,
                content_binding="user.bio",
            )
        )
