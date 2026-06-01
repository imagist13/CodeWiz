"""会话管理 API"""

import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path

from models.pipeline import PipelineState
from orchestrator.state import PipelineStateManager
from config import get_storage_path, get_project_root

router = APIRouter()


class CreateSessionRequest(BaseModel):
    pass


class SessionResponse(BaseModel):
    session_id: str
    phase: str
    phase_status: str


def get_state_manager() -> PipelineStateManager:
    return PipelineStateManager(str(Path(get_storage_path()) / "sessions"))


@router.post("/sessions", response_model=SessionResponse)
async def create_session(_: CreateSessionRequest | None = None):
    """创建新会话"""
    session_id = str(uuid.uuid4())[:8]
    manager = get_state_manager()
    state = manager.create(session_id)

    return SessionResponse(
        session_id=session_id,
        phase=state.phase.value,
        phase_status=state.phase_status.value,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """获取会话状态"""
    manager = get_state_manager()
    state = manager.load(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="会话不存在")
    return SessionResponse(
        session_id=session_id,
        phase=state.phase.value,
        phase_status=state.phase_status.value,
    )


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    manager = get_state_manager()
    path = Path(get_storage_path()) / "sessions" / f"pipeline_{session_id}.json"
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.get("/sessions")
async def list_sessions():
    """列出所有会话"""
    manager = get_state_manager()
    return {"sessions": manager.list_sessions()}
