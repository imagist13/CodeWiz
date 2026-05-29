"""Skill 声明式契约 (v3 Task 1).

替代 v1/v2 的固定 plan() 出 Step 列表设计。

新架构:
  Skill 不再写"怎么改", 只声明"做什么 / 禁止什么 / 验收条件",
  ExploreEditAgent 拿到 Contract 后自由探索代码并修改, acceptance 验收。

五字段:
  goal:              任务目标 (中文 PM 输入翻译)
  constraints:       软约束 (提示模型, 工具层也可同步硬约束)
  forbid:            禁区 (system prompt 写入 + FsTools denylist 双保险)
  acceptance:        验收清单 (FileContains / ForbidContains / GrepInDir)
  candidate_symbols: 候选符号 (提示词, 不是路径)
"""

from __future__ import annotations
from typing import List

from pydantic import BaseModel, Field

from app.skills.acceptance import AcceptanceCheck


class SkillContract(BaseModel):
    goal: str = Field(min_length=1)
    constraints: List[str] = Field(default_factory=list)
    forbid: List[str] = Field(default_factory=list)
    acceptance: List[AcceptanceCheck] = Field(min_length=1)
    candidate_symbols: List[str] = Field(default_factory=list)
