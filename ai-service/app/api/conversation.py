"""
Conversation API endpoint
"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.security import get_current_user
from app.core.database import get_db
from app.models.database import Conversation, Message
from app.models.schemas import ConversationCreate, ConversationResponse

router = APIRouter(prefix="/api/repos", tags=["conversations"])


@router.get("/{repo_id}/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    repo_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversations = db.query(Conversation).filter(
        Conversation.project_id == repo_id
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
    conversation = Conversation(
        project_id=repo_id,
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
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.asc()).all()

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
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted"}
