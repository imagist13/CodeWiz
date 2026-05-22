"""
Conversation API endpoint
"""
import logging
import uuid as uuid_mod
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.security import get_current_user
from app.core.database import get_db
from app.models.database import Conversation, Message
from app.models.schemas import ConversationCreate, ConversationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repos", tags=["conversations"])


def _to_uuid(val: str):
    """Accept both raw UUID strings and short IDs — convert to UUID for DB lookups."""
    try:
        return uuid_mod.UUID(val)
    except (ValueError, AttributeError):
        return val


@router.get("/{repo_id}/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    repo_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversations = db.query(Conversation).filter(
        Conversation.project_id == _to_uuid(repo_id)
    ).order_by(Conversation.created_at.desc()).all()

    return [
        ConversationResponse(
            id=c.id,
            project_id=c.project_id,
            title=c.title or "Untitled",
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat()
        )
        for c in conversations
    ]


@router.post("/{repo_id}/conversations", response_model=ConversationResponse)
async def create_conversation(
    repo_id: str,
    request: ConversationCreate,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project_uuid = _to_uuid(repo_id)
    logger.info(f"[conversation] Creating conversation for project_id={project_uuid}, title={request.title}")
    conversation = Conversation(
        project_id=project_uuid,
        title=request.title or f"Conversation"
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return ConversationResponse(
        id=conversation.id,
        project_id=conversation.project_id,
        title=conversation.title,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat()
    )


@router.get("/{repo_id}/conversations/{conversation_id}")
async def get_conversation(
    repo_id: str,
    conversation_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv_uuid = _to_uuid(conversation_id)
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_uuid
    ).first()

    if not conversation:
        logger.warning(f"[conversation] Conversation not found: id={conversation_id}")
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = db.query(Message).filter(
        Message.conversation_id == conv_uuid
    ).order_by(Message.created_at.asc()).all()

    logger.info(f"[conversation] GET conversation_id={conversation_id}, messages_count={len(messages)}")

    return {
        "id": str(conversation.id),
        "project_id": str(conversation.project_id),
        "title": conversation.title,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "created_at": m.created_at.isoformat()
            }
            for m in messages
        ]
    }


@router.delete("/{repo_id}/conversations/{conversation_id}")
async def delete_conversation(
    repo_id: str,
    conversation_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv_uuid = _to_uuid(conversation_id)
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_uuid
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted"}
