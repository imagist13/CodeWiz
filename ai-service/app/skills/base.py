"""Skill 抽象基类——单文件 + 自动发现的根。

BusinessSkill 是 PM 入口层（薄包装），只声明触发关键词 + 参数 schema，
plan() 内部组合一个或多个 PatternSkill 来产出真正的 Step 序列。

PatternSkill 是工程实现层（跨栈原子），target_symbols 声明它会动到的
CodeMap 符号类别，由 step_executor 配合 CodeMap 解析具体文件路径。
"""

from abc import ABC, abstractmethod
from typing import ClassVar, List
from pydantic import BaseModel

from .dsl import Step


class Skill(ABC):
    name: ClassVar[str]
    description: ClassVar[str]

    @abstractmethod
    def match(self, intent: str) -> float:
        """0~1 匹配置信度。router 取 top1。"""


class BusinessSkill(Skill):
    """PM 入口层。"""

    trigger_keywords: ClassVar[List[str]]
    params_schema: ClassVar[dict]

    @abstractmethod
    def plan(self, params: dict) -> List[Step]: ...


class PatternSkill(Skill):
    """工程实现层。"""

    target_symbols: ClassVar[List[tuple]]

    @abstractmethod
    def plan(self, dsl: BaseModel) -> List[Step]: ...
