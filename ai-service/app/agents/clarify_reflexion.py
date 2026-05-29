"""Reflexion 模式澄清节点。

两步：
  1. LLM 用一句话复述对需求的理解（understanding）
  2. LLM 反思这段理解中的歧义/矛盾/不完整, 输出 JSON {"questions": [...]}

输出供 LangGraph 合并 slot_check 的问题清单，一次性问 PM。
"""

import json
import re
from typing import List
from pydantic import BaseModel

from app.agents.llm_protocol import LLMClient


_UNDERSTAND_SYSTEM = (
    "你是产品需求理解助手。用 1-2 句话复述用户的需求，聚焦改什么、不要展开方案。"
)

_CRITIQUE_SYSTEM = (
    "你是需求审查助手。给定一段产品需求理解，找出其中的歧义、矛盾、"
    "不完整之处，转化为追问问题。\n"
    '严格输出 JSON，schema: {"questions": ["..."]}。'
    "如果没有歧义，questions 为空数组。"
)


class ClarifyResult(BaseModel):
    understanding: str
    questions: List[str]


class ClarifyReflexion:
    def __init__(self, llm: LLMClient):
        self._llm = llm

    async def clarify(self, intent: str) -> ClarifyResult:
        # Step 1: 复述理解
        r1 = await self._llm.chat(
            [
                {"role": "system", "content": _UNDERSTAND_SYSTEM},
                {"role": "user", "content": intent},
            ],
            temperature=0.0,
        )
        understanding = r1.content.strip()

        # Step 2: 反思批判
        r2 = await self._llm.chat(
            [
                {"role": "system", "content": _CRITIQUE_SYSTEM},
                {
                    "role": "user",
                    "content": f"原始需求: {intent}\n复述理解: {understanding}",
                },
            ],
            temperature=0.0,
        )
        questions = self._parse_questions(r2.content)

        return ClarifyResult(understanding=understanding, questions=questions)

    @staticmethod
    def _parse_questions(text: str) -> List[str]:
        # 兼容 LLM 在 JSON 外加 ```json``` 围栏的情况
        m = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
            qs = data.get("questions", [])
            return [str(q) for q in qs if q]
        except (json.JSONDecodeError, AttributeError):
            return []
