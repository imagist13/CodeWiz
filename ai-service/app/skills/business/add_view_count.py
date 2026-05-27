"""加阅读量——L1.1 魔改首炷题。

旧路径 (plan): 组合 add_field（int 字段 viewCount） + inject_display（首页卡片显示）。
v3 新路径 (contract):
  contract_l1a — 纯前端 viewCount 占位常量, 对齐端到端.md L1.1
  contract_l1b — 跨栈一致 (model + migration + controller + frontend), 对齐 §6.2 跨栈一致性

contract() 默认返 l1a, orchestrator 路由到 ExploreEditAgent 自由探索 + acceptance 验收。
旧 plan() 保留, 不破坏 PR #6 既有行为。
"""

from typing import List, Optional

from app.skills.base import BusinessSkill
from app.skills.contract import SkillContract
from app.skills.acceptance import FileContains, GrepInDir, ForbidContains
from app.skills.dsl import FieldDef, DisplayDef, Step
from app.skills.patterns.add_field import AddFieldPattern
from app.skills.patterns.inject_display import InjectDisplayPattern


class AddViewCountSkill(BusinessSkill):
    name = "add_view_count"
    description = "为 Article 加阅读量统计字段并在卡片显示"
    trigger_keywords = ["阅读量", "浏览量", "view", "view count", "pv", "热度"]
    params_schema = {
        "default": {
            "type": "int",
            "required": False,
            "default": 0,
            "doc": "viewCount 初始值",
        },
    }

    def match(self, intent: str) -> float:
        intent_low = intent.lower()
        hits = sum(1 for kw in self.trigger_keywords if kw.lower() in intent_low)
        return min(hits / 1.5, 1.0)

    def plan(self, params: dict) -> List[Step]:
        default = params.get("default", 0)
        return [
            *AddFieldPattern().plan(
                FieldDef(
                    model="Article",
                    field_name="viewCount",
                    field_type="int",
                    default=default,
                )
            ),
            *InjectDisplayPattern().plan(
                DisplayDef(
                    component="ArticlePreview",
                    binding="viewCount",
                    icon="👁",
                    position="card_meta",
                )
            ),
        ]

    def contract_l1a(self, params: Optional[dict] = None) -> SkillContract:
        """L1-A: 纯前端 viewCount 展示 (占位常量, 不改后端)."""
        return SkillContract(
            goal="在文章列表卡片上显示阅读量字段 viewCount (占位常量即可, 不改后端)",
            constraints=[
                "字段名必须叫 viewCount",
                "只改 frontend/src 下文件, 不动 backend/",
                "不修改 package.json / lockfile / .env",
            ],
            forbid=[
                "不实现真实递增逻辑 (这是 L1-A, 仅展示)",
                "不新增 npm 依赖",
                "不在编辑器路径出现 viewCount (只读字段)",
            ],
            acceptance=[
                GrepInDir(dir="frontend/src", pattern=r"viewCount", min_hits=1),
                FileContains(
                    path="frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
                    needle="viewCount",
                ),
                ForbidContains(
                    path="frontend/src/components/ArticleEditorForm/ArticleEditorForm.jsx",
                    needle="viewCount",
                ),
            ],
            candidate_symbols=[
                "ArticlesPreview",
                "ArticleMeta",
                "ArticleAuthorButtons",
            ],
        )

    def contract_l1b(self, params: Optional[dict] = None) -> SkillContract:
        """L1-B: 跨栈一致 (model + migration + controller + frontend), 不实现递增."""
        return SkillContract(
            goal=(
                "为 Article 加 viewCount 字段, model + migration + controller serialize 返回, "
                "前端列表卡片展示, 不实现真实递增逻辑"
            ),
            constraints=[
                "字段名必须叫 viewCount",
                "默认值 0",
                "backend controller 序列化必须包含该字段",
                "不修改 package.json / lockfile / .env",
            ],
            forbid=[
                "不在文章编辑 / 创建表单出现 viewCount (只读字段)",
                "不新增 npm 依赖",
                "不触碰 .env 与 .git/",
            ],
            acceptance=[
                GrepInDir(dir="backend/models", pattern=r"viewCount", min_hits=1),
                GrepInDir(dir="backend/migrations", pattern=r"viewCount", min_hits=1),
                GrepInDir(dir="backend/controllers", pattern=r"viewCount", min_hits=1),
                GrepInDir(dir="frontend/src", pattern=r"viewCount", min_hits=1),
                ForbidContains(
                    path="frontend/src/components/ArticleEditorForm/ArticleEditorForm.jsx",
                    needle="viewCount",
                ),
            ],
            candidate_symbols=[
                "Article",
                "articlesController",
                "ArticlesPreview",
                "ArticleMeta",
            ],
        )

    def contract(self, params: dict) -> Optional[SkillContract]:
        """默认走 L1-A (公开题 L1.1 范围)."""
        return self.contract_l1a(params)
