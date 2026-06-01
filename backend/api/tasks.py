from __future__ import annotations

"""Tasks (scheduled tasks) API."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.models import Task, User

router = APIRouter()


class CreateTaskRequest(BaseModel):
    name: str
    type: str = 'once'
    time_expr: str
    command: str
    enabled: bool = True


@router.get('/tasks')
async def list_tasks(
    username: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """List tasks for a user."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        return {'tasks': []}

    result = await db.execute(
        select(Task).where(Task.user_id == user.id).order_by(Task.created_at.desc())
    )
    tasks = result.scalars().all()
    return {
        'tasks': [
            {
                'id': t.id,
                'name': t.name,
                'type': t.type,
                'time_expr': t.time_expr,
                'command': t.command,
                'enabled': t.enabled,
                'last_run': t.last_run.isoformat() if t.last_run else None,
                'next_run': t.next_run.isoformat() if t.next_run else None,
                'created_at': t.created_at.isoformat()
            }
            for t in tasks
        ]
    }


@router.post('/tasks')
async def create_task(
    req: CreateTaskRequest,
    username: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new task."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')

    task = Task(
        id=f'task_{uuid.uuid4().hex[:8]}',
        user_id=user.id,
        name=req.name,
        type=req.type,
        time_expr=req.time_expr,
        command=req.command,
        enabled=req.enabled
    )
    db.add(task)
    await db.commit()
    return {'id': task.id, 'name': task.name}


@router.delete('/tasks/{task_id}')
async def delete_task(
    task_id: str,
    username: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete a task."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')

    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, 'Task not found')

    await db.delete(task)
    await db.commit()
    return {'deleted': True}
