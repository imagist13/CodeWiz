from fastapi import APIRouter, Depends
from app.core.response import success, ApiResponse
from app.core.security import get_current_user
from app.skills.manager import skill_manager

router = APIRouter()


@router.get("", response_model=ApiResponse)
async def list_skills(current_user: dict = Depends(get_current_user)):
    skills = skill_manager.discovery.list_metadata()
    return success([
        {
            "name": s.name,
            "description": s.description,
            "strict_references": s.strict_references,
        }
        for s in skills
    ])
