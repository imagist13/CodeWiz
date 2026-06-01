from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class ToolConfig(BaseModel):
    name: str = Field(..., description="Tool unique name")
    type: str = Field(default="python", description="Tool type: python or api")
    description: str = Field(..., description="Tool description")
    enabled: bool = Field(default=True, description="Whether tool is enabled")
    parameters: Optional[dict] = Field(default=None, description="JSON schema for parameters")
    config: Optional[dict] = Field(default=None, description="API tool config: url, method, headers, timeout")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ToolMetadata(BaseModel):
    name: str
    type: str
    description: str
    enabled: bool
    parameters: Optional[dict]
    config: Optional[dict]
