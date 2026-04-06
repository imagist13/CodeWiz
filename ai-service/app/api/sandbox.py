"""
Sandbox management API endpoints.
"""
from fastapi import APIRouter

from app.harness.sandbox_manager import get_sandbox_manager

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


@router.post("/start/{project_id}")
async def start_sandbox(project_id: str):
    """Start or resume a project's sandbox (dev server + static preview)."""
    manager = get_sandbox_manager()
    return manager.start_dev_server(project_id)


@router.get("/status/{project_id}")
async def sandbox_status(project_id: str):
    """
    Get sandbox status for a project.
    The frontend can poll this endpoint to get the live preview URL
    without needing a JWT (AI service is trusted).
    """
    manager = get_sandbox_manager()
    status = manager.get_status(project_id)
    if status.get("exists") and status.get("is_running"):
        repo_id = project_id
        status["proxy_url"] = f"/api/sandbox-preview/{repo_id}"
    return status


@router.post("/stop/{project_id}")
async def stop_sandbox(project_id: str):
    """Stop a project's sandbox."""
    manager = get_sandbox_manager()
    return manager.stop_dev_server(project_id)
