"""澄清阶段 API"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.clarify import clarify_loop, CLARIFY_SYSTEM_PROMPT
from provider import create_provider
from models.pipeline import PipelineState
from orchestrator.state import PipelineStateManager
from config import get_storage_path


router = APIRouter()


class ClarifyRequest(BaseModel):
    session_id: str
    message: str


class ClarifyResponse(BaseModel):
    type: str
    question: str | None = None
    requirement: dict | None = None
    done: bool = False


@router.post("/clarify")
async def clarify(request: ClarifyRequest):
    """单轮澄清（内部用）"""
    provider = create_provider()
    messages = [
        {"role": "system", "content": CLARIFY_SYSTEM_PROMPT},
        {"role": "user", "content": request.message},
    ]

    try:
        response = provider.respond(messages, tools=None)
        text = response.text.strip()

        # 检测追问
        import re
        questions = re.findall(
            r"(?:问题|Q)\s*\d*\s*[:：]\s*(.+?)(?=\n\n|\n$|$)",
            text,
            re.DOTALL
        )
        if not questions:
            questions = [
                line.strip() for line in text.split("\n")
                if any(kw in line for kw in ["是否", "能否", "要不要", "如何", "怎样"]) and len(line) > 5
            ]

        if questions:
            return ClarifyResponse(
                type="question",
                question=questions[0],
                done=False,
            )

        # 尝试解析 Requirement
        from agents.clarify import _parse_requirement
        req = _parse_requirement(text)
        if req:
            return ClarifyResponse(
                type="complete",
                requirement=req.model_dump(),
                done=True,
            )

        return ClarifyResponse(
            type="unknown",
            question=text[:500],
            done=False,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clarify/{session_id}/answer")
async def clarify_answer(session_id: str, request: ClarifyRequest):
    """PM 回复追问，继续澄清循环"""
    manager = PipelineStateManager(get_storage_path() + "/sessions")
    state = manager.load(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 更新状态为 PLAN
    state.advance(state.phase, {"last_answer": request.message})
    manager.save(state)

    return {"ok": True, "phase": state.phase.value}
