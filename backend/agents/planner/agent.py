"""PlannerAgent — 方案拆解子代理"""

import re
import json
from typing import Generator


PLANNER_SYSTEM_PROMPT = """你是一个资深全栈架构师，擅长将需求拆解为可执行的实现步骤。

## Conduit 项目结构

- **Backend**: Express.js + Sequelize + PostgreSQL, 端口 3001
  - `backend/models/` — Sequelize 模型（Article, User, Comment, Tag）
  - `backend/controllers/` — 请求处理逻辑
  - `backend/routes/` — Express 路由
  - `backend/middleware/` — JWT 认证 + 错误处理
- **Frontend**: React 19 + Vite + React Router, 端口 3000
  - `frontend/src/services/` — API 调用层
  - `frontend/src/components/` — 可复用组件
  - `frontend/src/routes/` — 页面组件
  - `frontend/src/context/` — AuthContext, FeedContext

## 拆解原则

1. 每个步骤对应一个具体可验证的产出
2. 遵循「后端先行」原则：Model → Controller → Route → Frontend
3. 每步注明验证方式（lint / test）
4. 识别跨栈一致性的风险（如新增字段需要同时更新前后端）

## 输出格式

输出一个 JSON 数组，每个元素是一个实现步骤：

```json
[
  {
    "step_id": "1",
    "description": "在后端 Article 模型中添加 favorited 布尔字段",
    "affected_files": ["backend/models/Article.js"],
    "operations": ["read", "write"],
    "risks": ["需要迁移数据库字段"]
  },
  ...
]
```

**重要**: 输出必须是有效的 JSON 数组，不要用 markdown 代码块包裹。
"""


def plan_from_requirement(
    provider,
    requirement_dict: dict,
) -> Generator[dict, None, list[dict]]:
    """
    根据需求生成实现方案。

    Yields:
        text_chunk 事件
    Returns:
        步骤列表
    """
    messages = [
        {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"请为以下需求生成实现方案：\n\n{json.dumps(requirement_dict, ensure_ascii=False, indent=2)}"
        },
    ]

    full_text = ""
    try:
        response = provider.respond(messages, tools=None)
        full_text = response.text

        # 流式输出
        sentences = re.split(r"(?<=[。！？\n])", full_text)
        for sent in sentences:
            if sent.strip():
                yield {"type": "text_chunk", "content": sent}

        # 尝试解析 JSON 方案
        steps = _parse_steps(full_text)
        yield {"type": "plan_proposed", "steps": steps}
        return steps

    except Exception as e:
        yield {"type": "error", "content": f"PlannerAgent 错误: {e}"}
        return []


def _parse_steps(text: str) -> list[dict]:
    """从文本中解析步骤 JSON"""
    # 移除 markdown 代码块
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = text.strip()

    # 尝试找到 JSON 数组
    try:
        # 找第一个 [ 和最后一个 ]
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            candidate = text[start:end + 1]
            data = json.loads(candidate)
            if isinstance(data, list) and all("step_id" in s or "description" in s for s in data):
                return data
    except json.JSONDecodeError:
        pass

    # 回退：按行解析简单格式
    steps = []
    current = {}
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        if re.match(r"^\d+[.、]\s*(.+)", line):
            if current:
                steps.append(current)
            current = {"step_id": re.match(r"^\d+", line).group(), "description": re.match(r"^\d+[.、]\s*(.+)", line).group(1)}
        elif "affected_files" in line or "files" in line.lower():
            current["affected_files"] = [f.strip() for f in line.split(",") if f.strip()]
        elif "risks" in line.lower() or "风险" in line:
            current["risks"] = [line]

    if current:
        steps.append(current)

    return steps
