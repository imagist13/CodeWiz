from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal
from app.tools.registry import tool_registry
from app.core.response import success, ApiResponse
from app.core.security import get_current_user

router = APIRouter()

TOOL_TYPES = Literal["agent", "api", "function"]


class CreateToolRequest(BaseModel):
    name: str
    type: TOOL_TYPES = Field(..., description="工具类型：agent / api / function")
    description: str
    parameters: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None
    enabled: bool = True


class UpdateToolRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


@router.get("", response_model=ApiResponse)
async def list_tools(current_user: dict = Depends(get_current_user)):
    tools = tool_registry.list_tools(current_user["id"])
    return success(tools)


@router.post("", response_model=ApiResponse)
async def create_tool(request: CreateToolRequest, current_user: dict = Depends(get_current_user)):
    tool = tool_registry.create_tool(
        name=request.name,
        tool_type=request.type,
        description=request.description,
        parameters=request.parameters,
        config=request.config,
        enabled=request.enabled,
        user_id=current_user["id"],
    )
    return success(tool)


@router.put("/{tool_name}", response_model=ApiResponse)
async def update_tool(tool_name: str, request: UpdateToolRequest, current_user: dict = Depends(get_current_user)):
    tool = tool_registry.update_tool(
        name=tool_name,
        new_name=request.name,
        description=request.description,
        parameters=request.parameters,
        config=request.config,
        enabled=request.enabled,
        user_id=current_user["id"],
    )
    return success(tool)


@router.delete("/{tool_name}", response_model=ApiResponse)
async def delete_tool(tool_name: str, current_user: dict = Depends(get_current_user)):
    tool_registry.delete_tool(tool_name, current_user["id"])
    return success({"name": tool_name, "deleted": True})


@router.put("/{tool_name}/toggle", response_model=ApiResponse)
async def toggle_tool(tool_name: str, current_user: dict = Depends(get_current_user)):
    tool_registry.toggle_tool(tool_name, current_user["id"])
    return success({"name": tool_name, "enabled": tool_registry.is_enabled(tool_name, current_user["id"])})
