"""Requirement 结构化需求 DSL"""

from typing import Any
from pydantic import BaseModel, Field


class FieldSpec(BaseModel):
    """字段规格"""
    name: str
    type: str  # string, integer, boolean, array, object
    description: str = ""
    required: bool = False
    default: Any = None


class OperationSpec(BaseModel):
    """操作规格"""
    name: str  # create, read, update, delete
    description: str = ""


class Requirement(BaseModel):
    """结构化需求 DSL"""
    title: str = Field(description="需求标题")
    type: str = Field(description="需求类型: new_feature / enhancement / fix")
    scope: list[str] = Field(description="涉及层次: backend / frontend")
    entities: list[str] = Field(description="涉及的数据实体: Article, User, Comment")
    operations: list[str] = Field(description="操作类型: create, read, update, delete")
    fields: list[FieldSpec] = Field(default_factory=list, description="新增或修改的字段")
    acceptance: list[str] = Field(default_factory=list, description="验收标准")
    ambiguity: list[str] = Field(default_factory=list, description="待澄清项")
    notes: str = Field(default="", description="补充说明")

    def to_prompt(self) -> str:
        """转为人类可读格式"""
        lines = [
            f"## 需求摘要",
            f"标题: {self.title}",
            f"类型: {self.type}",
            f"涉及层次: {', '.join(self.scope)}",
            f"涉及实体: {', '.join(self.entities)}",
            f"操作: {', '.join(self.operations)}",
        ]
        if self.fields:
            lines.append(f"新字段:")
            for f in self.fields:
                lines.append(f"  - {f.name} ({f.type}): {f.description}")
        if self.acceptance:
            lines.append("验收标准:")
            for i, a in enumerate(self.acceptance, 1):
                lines.append(f"  {i}. {a}")
        if self.ambiguity:
            lines.append(f"待澄清: {', '.join(self.ambiguity)}")
        if self.notes:
            lines.append(f"备注: {self.notes}")
        return "\n".join(lines)
