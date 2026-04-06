"""
Auth API endpoint for AI service.
Validates JWT tokens by calling the Go backend.
"""
from fastapi import APIRouter, Depends
from app.core.security import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
async def auth_me(current_user: dict = Depends(get_current_user)):
    """Get current user info (validated via Go backend)."""
    return {
        "id": current_user.get("id"),
        "email": current_user.get("email"),
        "name": current_user.get("name"),
        "avatar_url": current_user.get("avatar_url"),
    }
