"""可观测性 API"""

import json
from fastapi import APIRouter
from pydantic import BaseModel

from harness import EventLogger, CheckpointManager, Evaluator, ReportGenerator
from config import get_storage_path


router = APIRouter()


@router.get("/obs/{session_id}/stats")
async def get_stats(session_id: str):
    """获取会话统计"""
    logger = EventLogger(session_id, f"{get_storage_path()}/events")
    return logger.get_stats()


@router.get("/obs/{session_id}/events")
async def get_events(session_id: str, type: str | None = None):
    """获取事件流"""
    logger = EventLogger(session_id, f"{get_storage_path()}/events")
    if type:
        return {"events": logger.get_events_by_type(type)}
    return {"events": logger.get_events()}


@router.get("/obs/{session_id}/checkpoints")
async def list_checkpoints(session_id: str):
    """列出检查点"""
    mgr = CheckpointManager(f"{get_storage_path()}/checkpoints")
    cps = mgr.list_checkpoints(session_id)
    return {
        "checkpoints": [
            {
                "index": cp.index,
                "phase": cp.phase.value,
                "event_seq": cp.event_seq,
                "saved_at": cp.saved_at,
            }
            for cp in cps
        ]
    }


@router.post("/obs/{session_id}/checkpoints/{index}/restore")
async def restore_checkpoint(session_id: str, index: int):
    """从检查点恢复"""
    mgr = CheckpointManager(f"{get_storage_path()}/checkpoints")
    cp = mgr.restore(session_id, index)
    if not cp:
        return {"ok": False, "error": "检查点不存在"}
    return {
        "ok": True,
        "checkpoint": {
            "index": cp.index,
            "phase": cp.phase.value,
            "phase_data": cp.phase_data,
            "event_seq": cp.event_seq,
            "saved_at": cp.saved_at,
        }
    }


@router.get("/obs/{session_id}/report")
async def get_report(session_id: str):
    """生成评测报告"""
    logger = EventLogger(session_id, f"{get_storage_path()}/events")
    evaluator = Evaluator()
    reporter = ReportGenerator(f"{get_storage_path()}/reports")

    events = logger.get_events()
    eval_result = evaluator.evaluate(events)

    path = reporter.save_report(session_id, events, eval_result)
    data = evaluator.to_dict(eval_result)

    return {
        "report_path": path,
        "evaluation": data,
    }
