"""方案评审 API"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.planner import plan_from_requirement
from provider import create_provider
from models.pipeline import PipelineState
from orchestrator.state import PipelineStateManager
from config import get_storage_path


router = APIRouter()


class PlanRequest(BaseModel):
    session_id: str
    requirement: dict


class ApproveRequest(BaseModel):
    session_id: str
    feedback: str = ""


@router.post("/plan/generate")
async def generate_plan(request: PlanRequest):
    """生成实现方案"""
    provider = create_provider()

    steps = []
    async def consume():
        nonlocal steps
        try:
            for event in plan_from_requirement(provider, request.requirement):
                etype = event.get("type", "")
                if etype == "text_chunk":
                    yield f"data: {json.dumps({'type': 'text', 'content': event['content']})}\n\n"
                elif etype == "plan_proposed":
                    steps = event.get("steps", [])
                    yield f"data: {json.dumps({'type': 'plan_proposed', 'steps': steps})}\n\n"
                elif etype == "error":
                    yield f"data: {json.dumps({'type': 'error', 'content': event.get('content', '')})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(consume(), media_type="text/event-stream")


@router.post("/plan/approve")
async def approve_plan(request: ApproveRequest):
    """PM 审批方案"""
    manager = PipelineStateManager(get_storage_path() + "/sessions")
    state = manager.load(request.session_id)
    if not state:
        raise HTTPException(status_code=404, detail="会话不存在")

    from models.pipeline import Phase
    if state.phase != Phase.PLAN:
        raise HTTPException(status_code=400, detail=f"当前阶段是 {state.phase.value}，不是 plan")

    if request.feedback:
        # 有修改意见，更新方案
        state.phase_data[Phase.PLAN.value]["feedback"] = request.feedback
        manager.save(state)
        return {"ok": True, "action": "revised", "phase": state.phase.value}

    # 批准，进入下一阶段
    state.phase_data[Phase.PLAN.value]["approved"] = True
    next_phase = Phase.LOCATE
    state.advance(next_phase, {})
    manager.save(state)

    return {"ok": True, "action": "approved", "next_phase": next_phase.value}
