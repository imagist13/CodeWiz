from __future__ import annotations

"""Conversations API."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.models import Conversation, User, Message
from paths import get_data_dir, ensure_dir
import os

router = APIRouter()


@router.get('/conversations')
async def list_conversations(
    username: str | None = Query(None),
    show_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """List conversations for a user.

    Args:
        username: filter by user
        show_archived: if True, include archived conversations; default False (active only)
    """
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        return {'conversations': []}

    query = select(Conversation).where(Conversation.user_id == user.id)
    if not show_archived:
        query = query.where(Conversation.archived == False)
    query = query.order_by(desc(Conversation.updated_at)).limit(50)

    result = await db.execute(query)
    convs = result.scalars().all()

    if not convs:
        return {'conversations': []}

    # Pre-load message counts in a single query to avoid N+1 problem
    conv_ids = [c.id for c in convs]
    count_result = await db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .where(Message.conversation_id.in_(conv_ids))
        .group_by(Message.conversation_id)
    )
    count_map = {row[0]: row[1] for row in count_result.all()}

    return {
        'conversations': [
            {
                'id': c.id,
                'title': c.title,
                'created_at': c.created_at.isoformat(),
                'updated_at': c.updated_at.isoformat(),
                'archived': c.archived,
                'summary': c.summary,
                'message_count': count_map.get(c.id, 0)
            }
            for c in convs
        ]
    }


@router.post('/conversations')
async def create_conversation(
    username: str = Query(...),
    title: str = 'Untitled',
    db: AsyncSession = Depends(get_db)
):
    """Create a new conversation."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')

    conv_id = f'conv_{uuid.uuid4().hex[:12]}'
    conv = Conversation(
        id=conv_id,
        user_id=user.id,
        title=title
    )
    db.add(conv)
    await db.commit()

    return {'id': conv.id, 'title': conv.title, 'created_at': conv.created_at.isoformat()}


@router.post('/conversations/load')
async def load_conversation(
    id: str = Query(...),
    username: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Load conversation messages."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')

    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, 'Conversation not found')

    # Load messages
    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == id)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()

    return {
        'id': conv.id,
        'title': conv.title,
        'created_at': conv.created_at.isoformat(),
        'messages': [
            {
                'id': m.id,
                'role': m.role,
                'content': m.content,
                'tool_calls': m.tool_calls,
                'created_at': m.created_at.isoformat()
            }
            for m in messages
        ]
    }


@router.delete('/conversations/{conv_id}')
async def delete_conversation(
    conv_id: str,
    username: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete a conversation."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')

    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, 'Conversation not found')

    await db.delete(conv)
    await db.commit()
    return {'deleted': True}


@router.post('/conversations/{conv_id}/archive')
async def archive_conversation(
    conv_id: str,
    username: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Archive/unarchive a conversation."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')

    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, 'Conversation not found')

    conv.archived = not conv.archived
    conv.updated_at = datetime.utcnow()
    await db.commit()
    return {'archived': conv.archived}


@router.post('/conversations/{conv_id}/rename')
async def rename_conversation(
    conv_id: str,
    title: str = Query(...),
    username: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Rename a conversation."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'User not found')

    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, 'Conversation not found')

    conv.title = title
    conv.updated_at = datetime.utcnow()
    await db.commit()
    return {'title': conv.title}
