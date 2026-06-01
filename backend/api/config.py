"""Configuration API — per-user settings including multi-provider LLM config."""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

log = logging.getLogger(__name__)

from core.config import load_user_config, save_user_config

router = APIRouter()


class ConfigUpdateRequest(BaseModel):
    username: str
    # Generic
    provider: str | None = None
    api_key: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    streaming: bool | None = None
    font_size: int | None = None
    theme: str | None = None
    soul: str | None = None
    max_history: int | None = None
    tool_timeout: int | None = None
    auto_improve_time: int | None = None
    forget_time: int | None = None
    max_tool_rounds: int | None = None
    # OpenAI
    model: str | None = None
    base_url: str | None = None
    # MiniMax
    minimax_model: str | None = None
    minimax_api_key: str | None = None
    minimax_base_url: str | None = None
    # DeepSeek
    deepseek_model: str | None = None
    deepseek_api_key: str | None = None
    deepseek_base_url: str | None = None
    # Anthropic
    anthropic_model: str | None = None
    anthropic_api_key: str | None = None


@router.get("/config")
async def get_config(username: str = Query(...)):
    """Get user config (API key masked for security)."""
    config = load_user_config(username)
    # Mask API keys
    for key in ("api_key", "minimax_api_key", "deepseek_api_key", "anthropic_api_key"):
        if config.get(key):
            config[key] = config[key][:4] + "****"
    return config


@router.post("/config")
async def update_config(body: ConfigUpdateRequest):
    """Update user config — supports all providers."""
    username = body.username
    config = load_user_config(username)

    # All allowed config keys
    allowed = {
        # generic
        "provider", "api_key", "temperature", "max_tokens", "streaming",
        "font_size", "theme", "soul", "max_history", "tool_timeout",
        "auto_improve_time", "forget_time", "max_tool_rounds",
        # openai / compatible
        "model", "base_url",
        # minimax
        "minimax_model", "minimax_api_key", "minimax_base_url",
        # deepseek
        "deepseek_model", "deepseek_api_key", "deepseek_base_url",
        # anthropic
        "anthropic_model", "anthropic_api_key",
    }

    for key, value in body.model_dump().items():
        if key == "username":
            continue
        if key in allowed and value is not None:
            config[key] = value

    save_user_config(username, config)
    log.info(f"Config updated for {username}: {list(body.model_dump(exclude_none=True).keys())}")
    return {"status": "ok"}
