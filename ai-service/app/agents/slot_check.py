"""槽位检查：根据 Skill.params_schema 检查 PM 已提供参数中的必填项是否齐全。

未填必填项 → 生成自然语言追问，由 clarify_reflexion 节点合并展示给 PM。
可选项缺失 → 自动用 schema 中的 default 填上。
"""

from typing import List, Any, Dict
from pydantic import BaseModel


class SlotCheckResult(BaseModel):
    missing: List[str]
    questions: List[str]
    filled: Dict[str, Any]


class SlotChecker:
    def check(self, skill_cls_or_instance, provided: Dict[str, Any]) -> SlotCheckResult:
        schema = skill_cls_or_instance.params_schema
        missing: List[str] = []
        questions: List[str] = []
        filled: Dict[str, Any] = dict(provided)

        for name, spec in schema.items():
            required = spec.get("required", False)
            if name in provided:
                continue
            if required:
                missing.append(name)
                questions.append(self._make_question(name, spec))
            else:
                if "default" in spec:
                    filled[name] = spec["default"]

        return SlotCheckResult(missing=missing, questions=questions, filled=filled)

    @staticmethod
    def _make_question(name: str, spec: Dict[str, Any]) -> str:
        doc = spec.get("doc", "")
        type_ = spec.get("type", "value")
        if doc:
            return f"参数 `{name}` 未指定，需要一个 {type_}：{doc}"
        return f"参数 `{name}` 未指定，需要一个 {type_}"
