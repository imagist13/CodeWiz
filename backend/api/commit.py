"""提交阶段 API"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from conduit.repo import ConduitRepo
from models.pipeline import Phase
from orchestrator.state import PipelineStateManager
from config import get_storage_path, get_conduit_repo_path


router = APIRouter()


class CommitRequest(BaseModel):
    session_id: str
    message: str
    branch: str = ""


@router.post("/commit/create-branch")
async def create_branch(session_id: str, branch_name: str):
    """创建分支"""
    repo = ConduitRepo()
    result = repo.create_branch(branch_name)
    return {"ok": "OK" in result, "message": result}


@router.post("/commit/save")
async def commit_save(request: CommitRequest):
    """Git 提交"""
    from skills.git_ops.tool import git_commit, git_status

    status = git_status()
    if "干净" in status:
        return {"ok": True, "message": "无变更", "committed": False}

    result = git_commit(request.message)
    return {
        "ok": "OK" in result,
        "message": result,
        "committed": "OK" in result,
    }


@router.post("/commit/push")
async def push(remote: str = "origin", branch: str = ""):
    """推送到远程"""
    from skills.git_ops.tool import git_push
    result = git_push(remote, branch)
    return {"ok": "OK" in result, "message": result}


@router.get("/commit/status")
async def commit_status():
    """查看提交状态"""
    from skills.git_ops.tool import git_status, git_log
    return {
        "status": git_status(),
        "log": git_log(5),
    }
