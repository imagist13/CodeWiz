from __future__ import annotations

"""User management API."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.models import User

router = APIRouter()


class CreateUserRequest(BaseModel):
    username: str
    password: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: Optional[str] = None


class UserResponse(BaseModel):
    username: str
    created_at: datetime
    is_admin: bool


@router.get('/users')
async def list_users(db: AsyncSession = Depends(get_db)):
    """List all users."""
    result = await db.execute(select(User))
    users = result.scalars().all()
    return {
        'users': [
            {
                'username': u.username,
                'created_at': u.created_at.isoformat(),
                'is_admin': u.is_admin
            }
            for u in users
        ]
    }


@router.post('/users')
async def create_user(req: CreateUserRequest, db: AsyncSession = Depends(get_db)):
    """Create a new user."""
    from paths import ensure_dir, get_user_dir
    import bcrypt

    # Check if exists
    result = await db.execute(select(User).where(User.username == req.username))
    if result.scalar_one_or_none():
        raise HTTPException(400, 'User already exists')

    # Hash password
    password_hash = None
    if req.password:
        password_hash = bcrypt.hashpw(
            req.password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')

    # Create DB record
    user = User(
        username=req.username,
        password_hash=password_hash,
        is_admin=False
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Create user data directory
    ensure_dir(get_user_dir(req.username))

    return {'username': user.username, 'created_at': user.created_at.isoformat()}


@router.post('/select-user')
async def select_user(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login / select a user."""
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(404, 'User not found')

    if user.password_hash:
        if not req.password:
            raise HTTPException(401, 'Password required')
        import bcrypt
        try:
            if not bcrypt.checkpw(req.password.encode('utf-8'), user.password_hash.encode('utf-8')):
                raise HTTPException(401, 'Invalid password')
        except Exception:
            raise HTTPException(401, 'Invalid password')

    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()

    return {
        'username': user.username,
        'is_admin': user.is_admin
    }


@router.get('/session')
async def get_session(username: str, db: AsyncSession = Depends(get_db)):
    """Get session info for a user."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')
    return {
        'username': user.username,
        'is_admin': user.is_admin,
        'last_login': user.last_login.isoformat() if user.last_login else None
    }
