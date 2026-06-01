"""聊天 SSE 流式端点"""

import json
import uuid
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
import asyncio

from engine import ChatManager, ToolRunner, run_chat_turn
from provider import create_provider
from skills import get_cached_skills_info
from models.event import PipelineEventType
from config import get_storage_path
from orchestrator.state import PipelineStateManager


router = APIRouter()


def _build_system_prompt(phase: str = "clarify") -> str:
    """构建 system prompt"""
    skills = get_cached_skills_info()

    lines = [
        "你是一个全栈开发 AI Agent，基于 Conduit 全栈项目工作。",
        "Conduit 是一个 Medium 克隆应用：",
        "  - Backend: Express.js + Sequelize + PostgreSQL, 端口 3001",
        "  - Frontend: React 19 + Vite + React Router, 端口 3000",
        "",
        "## 可用工具（function calling）",
    ]

    tool_skills = [s for s in skills if s["has_tools"]]
    guide_skills = [s for s in skills if not s["has_tools"]]

    if tool_skills:
        lines.append("\n### 工具型 Skill（可直接调用）")
        for s in tool_skills:
            lines.append(f"- **{s['name']}**: {s['description']}")

    if guide_skills:
        lines.append("\n### 指令型 Skill（阅读 SKILL.md 获取详细指南）")
        for s in guide_skills:
            lines.append(f"- **{s['name']}**: {s['description']}")

    lines.extend([
        "",
        "## 行为规范",
        "1. 每次操作前先检查工具的 SKILL.md",
        "2. 生成文件使用 conduit_write_code",
        "3. 所有路径相对于 Conduit 仓库根目录",
        "4. 遵循后端优先原则：Model → Controller → Route → Frontend",
    ])

    return "\n".join(lines)


@router.post("/chat/{session_id}")
async def chat_stream(session_id: str, request: Request):
    """SSE 流式聊天端点"""

    body = await request.json()
    message = body.get("message", "")
    phase = body.get("phase", "clarify")

    storage_dir = f"{get_storage_path()}/sessions/{session_id}"
    provider = create_provider()

    # 构建 system message
    system_prompt = _build_system_prompt(phase)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]

    chat = ChatManager(session_id, storage_dir)
    chat.messages = messages

    tool_runner = ToolRunner()
    tool_runner.reset_count()

    # 加载工具 schema
    from engine.tool import load_tool_schemas
    tools = load_tool_schemas()

    async def event_generator():
        try:
            for event in run_chat_turn(chat, tool_runner, provider, tools):
                etype = event.get("type", "")

                if etype == "error":
                    yield {"event": "error", "data": json.dumps(event, ensure_ascii=False)}
                    continue

                if etype == "tool_call":
                    yield {"event": "tool_call", "data": json.dumps(event, ensure_ascii=False)}
                    continue

                if etype == "usage":
                    yield {"event": "usage", "data": json.dumps(event, ensure_ascii=False)}
                    continue

                if etype == "text_chunk":
                    yield {"event": "text", "data": json.dumps({"content": event.get("content", "")}, ensure_ascii=False)}
                    continue

                if etype == "thinking_chunk":
                    yield {"event": "thinking", "data": json.dumps({"content": event.get("content", "")}, ensure_ascii=False)}
                    continue

                if etype in ("done", "max_rounds"):
                    chat.save_history()
                    yield {"event": "done", "data": "{}"}

        except Exception as e:
            yield {"event": "error", "data": json.dumps({"content": str(e)}, ensure_ascii=False)}

    return EventSourceResponse(event_generator())


@router.get("/chat/{session_id}/history")
async def get_history(session_id: str):
    """获取对话历史"""
    storage_dir = f"{get_storage_path()}/sessions/{session_id}"
    import os
    history_file = os.path.join(storage_dir, f"{session_id}.json")
    if not os.path.exists(history_file):
        return {"messages": []}
    import json
    with open(history_file, encoding="utf-8") as f:
        return {"messages": json.load(f)}
