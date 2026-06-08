from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class Session(BaseModel):
    id: str = Field(..., description="Session unique identifier")
    title: str = Field(default="New Session", description="Session display title")
    system_prompt: Optional[str] = Field(
        default="You are a helpful AI assistant.",
        description="System prompt for this session"
    )
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SessionCreate(BaseModel):
    title: Optional[str] = "New Session"
    system_prompt: Optional[str] = "You are a helpful AI assistant."
    temperature: Optional[float] = 0.7
    mode: Optional[str] = "agent"
    domain_id: Optional[str] = None


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    pinned: Optional[int] = None
