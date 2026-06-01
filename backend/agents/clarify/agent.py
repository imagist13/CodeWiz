"""ClarifyAgent — 需求澄清子代理"""

import re
import uuid
from typing import Generator

from models.requirement import Requirement
from models.event import PipelineEventType


CLARIFY_SYSTEM_PROMPT = """你是一个资深产品经理，擅长在开发前充分澄清需求。

你的职责：
1. 分析 PM 提出的需求描述
2. 识别模糊、有歧义或不完整的地方
3. 主动追问，确保完全理解后再输出结构化需求

## 追问原则

每次只问 1-2 个最关键的问题，避免一次性追问太多。追问应该：
- 具体且可回答（不是开放式泛泛而问）
- 帮助缩小实现范围
- 针对：边界条件、用户交互、错误处理、性能要求等

## 澄清完成后

当你认为需求已经足够清晰，能够回答以下所有问题后，输出结构化的 Requirement JSON：

```json
{
  "title": "需求标题",
  "type": "new_feature | enhancement | fix",
  "scope": ["backend", "frontend"] 或 ["backend"] 或 ["frontend"],
  "entities": ["Article", "User", ...],
  "operations": ["create", "read", "update", "delete"],
  "fields": [{"name": "...", "type": "...", "description": "...", "required": true}],
  "acceptance": ["验收标准1", "验收标准2"],
  "ambiguity": [],
  "notes": "补充说明"
}
```

**重要**: 输出必须是可以被 JSON.parse() 解析的有效 JSON，不要包含 markdown 代码块标记。
"""


def _extract_questions(text: str) -> list[dict]:
    """从文本中提取追问列表"""
    questions = []

    # 匹配 "问题："、"Q:"、"？" 等模式
    patterns = [
        r"(?:问题|Q)\s*\d*\s*[:：]\s*(.+?)(?=(?:\n|$))",
        r"(\d+[.．、]\s*(?:是否|能否|要不要|要不要|如何|怎样|请说明).+?(?=\n|$))",
    ]

    lines = text.split("\n")
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        if any(kw in line for kw in ["是否", "能否", "要不要", "如何", "怎样", "请问", "能否详细", "请说明"]):
            if len(line) > 5 and len(line) < 300:
                questions.append({
                    "id": f"q_{len(questions) + 1}",
                    "text": line,
                    "line": i,
                })

    return questions[:3]


def _parse_requirement(text: str) -> Requirement | None:
    """从文本中解析 Requirement JSON"""
    # 尝试提取 JSON
    patterns = [
        r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}",  # 简单嵌套支持
    ]

    for pattern in patterns:
        matches = re.findall(pattern, text, re.DOTALL)
        for match in matches:
            try:
                import json
                data = json.loads(match)
                if "title" in data and "type" in data:
                    return Requirement(**data)
            except (json.JSONDecodeError, Exception):
                continue

    return None


def clarify_loop(
    provider,
    requirement_text: str,
) -> Generator[dict, None, Requirement]:
    """
    澄清循环：生成追问 → 收集回答 → 直到无歧义

    Yields:
        {"type": "clarify_question", "question": {...}}
        {"type": "clarify_wait", "question_id": "q_1"}
        {"type": "clarify_complete", "requirement": Requirement}
        {"type": "error", "content": "..."}
    """
    messages = [
        {"role": "system", "content": CLARIFY_SYSTEM_PROMPT},
        {"role": "user", "content": requirement_text},
    ]

    while True:
        try:
            response = provider.respond(messages, tools=None)
        except Exception as e:
            yield {"type": PipelineEventType.ERROR.value, "content": f"ClarifyAgent 错误: {e}"}
            return

        text = response.text.strip()

        # 流式输出（按句子分割）
        sentences = re.split(r"(?<=[。！？\n])", text)
        for sent in sentences:
            if sent.strip():
                yield {"type": "text_chunk", "content": sent}
                yield {"type": PipelineEventType.TEXT_CHUNK.value, "content": sent}

        # 检测追问
        questions = _extract_questions(text)
        if questions:
            for q in questions:
                yield {"type": PipelineEventType.CLARIFY_QUESTION.value, "question": q}

            # 等待 PM 回复（这里返回，等待调用方注入答案）
            yield {"type": "clarify_wait"}

            # 调用方会注入 answer，然后继续循环
            # 本生成器通过 throw() 或外部循环重新进入
            break

        # 无追问 → 尝试解析 Requirement
        req = _parse_requirement(text)
        if req:
            yield {"type": PipelineEventType.CLARIFY_COMPLETE.value, "requirement": req.model_dump()}
            yield {"type": "text_done"}
            return

        # 无法解析，但也没有追问 → 标记完成
        yield {"type": PipelineEventType.CLARIFY_COMPLETE.value, "requirement": {
            "title": requirement_text[:50],
            "type": "new_feature",
            "scope": ["backend", "frontend"],
            "entities": [],
            "operations": [],
            "fields": [],
            "acceptance": [],
            "ambiguity": ["无法解析完整需求，请人工确认"],
            "notes": text,
        }}
        return
