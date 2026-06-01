"""验证阶段 API"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from conduit.lint import run_eslint
from conduit.test import run_vitest
from models.pipeline import Phase
from orchestrator.state import PipelineStateManager
from config import get_storage_path


router = APIRouter()


class VerifyRequest(BaseModel):
    session_id: str
    scope: str = "all"  # all / frontend / backend


@router.post("/verify/lint")
async def verify_lint(request: VerifyRequest):
    """运行 Lint 检查"""
    result = run_eslint(scope=request.scope, fix=False)
    return result


@router.post("/verify/test")
async def verify_test(request: VerifyRequest):
    """运行测试"""
    result = run_vitest(scope=request.scope)
    return result


@router.post("/verify/full")
async def verify_full(request: VerifyRequest):
    """完整验证（Lint + Test）"""
    lint_result = run_eslint(scope=request.scope)
    test_result = run_vitest(scope=request.scope)

    all_passed = lint_result.get("passed", False) and test_result.get("passed", False)

    # 更新 Pipeline 状态
    manager = PipelineStateManager(get_storage_path() + "/sessions")
    state = manager.load(request.session_id)
    if state and state.phase == Phase.VERIFY:
        if all_passed:
            state.advance(Phase.COMMIT, {
                "lint": lint_result,
                "test": test_result,
            })
            manager.save(state)

    return {
        "all_passed": all_passed,
        "lint": lint_result,
        "test": test_result,
    }
