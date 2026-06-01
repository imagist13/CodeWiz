from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


class Message(BaseModel):
    id: str = Field(..., description="Message unique identifier")
    session_id: str = Field(..., description="Parent session ID")
    role: Literal["user", "assistant", "system", "tool"] = Field(...)
    content: str = Field(default="", description="Message content")
    tool_calls: Optional[list] = Field(default=None, description="Tool calls if any")
    tool_call_id: Optional[str] = Field(default=None, description="Associated tool call ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
