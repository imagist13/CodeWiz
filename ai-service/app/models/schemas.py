from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field
from uuid import UUID


class MessagePart(BaseModel):
    type: str
    text: Optional[str] = None
    tool_call: Optional[Dict[str, Any]] = None


class UIMessage(BaseModel):
    role: str
    id: str = Field(default_factory=lambda: str(UUID))
    parts: List[MessagePart] = []
    content: Optional[str] = None


class ChatRequest(BaseModel):
    model_config = {"populate_by_name": True}

    messages: List[UIMessage]
    repo_id: Optional[str] = Field(default=None, validation_alias="repoId")
    conversation_id: Optional[str] = Field(default=None, validation_alias="conversationId")
    project_id: Optional[str] = Field(default=None)


class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any]


class ToolResult(BaseModel):
    tool_call_id: str
    tool_name: str
    result: Any
    is_error: bool = False


class ChatStreamEvent(BaseModel):
    type: str
    content: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_name: Optional[str] = None
    reasoning: Optional[str] = None
    finish_reason: Optional[str] = None


class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ConversationResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
