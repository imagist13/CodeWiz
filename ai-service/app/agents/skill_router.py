"""Skill 路由：取 BusinessSkill 列表，每个 match(intent) → 0~1 置信度。

返回 top3 候选 + top1 命中。LangGraph 拿到结果后：
  - top1.confidence >= 0.6 → 直接进 slot_check
  - top1.confidence <  0.6 → L2 卡点让 PM 在 top3 里选

MVP 用关键词匹配（已在每个 Skill 的 match() 内实现）。
Sprint 2 可加 LLM 同义判断增强。
"""

from typing import List
from pydantic import BaseModel

from app.skills.registry import SkillRegistry


class RouterCandidate(BaseModel):
    skill_name: str
    confidence: float


class RouterResult(BaseModel):
    top1: RouterCandidate
    candidates: List[RouterCandidate]  # 已按 confidence 降序


class SkillRouter:
    def __init__(self, registry: SkillRegistry):
        self._registry = registry

    def route(self, intent: str) -> RouterResult:
        # FIXME(sprint-2): MVP 用 Skill.match() 内的关键词命中。
        # 触发返工: PM 输入"我想统计每篇文章被看了多少次"没命中 add_view_count。
        # 改法: 这里加一层 LLM 同义判断, 在关键词分数 < 0.5 时调豆包让它在
        #       business_names() 里选一个, 接口签名不变 (仍返 RouterResult)。
        scored = [
            RouterCandidate(skill_name=s.name, confidence=s.match(intent))
            for s in self._registry.all_business()
        ]
        scored.sort(key=lambda c: c.confidence, reverse=True)
        top3 = scored[:3]
        return RouterResult(top1=top3[0], candidates=top3)
