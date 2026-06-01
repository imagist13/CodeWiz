"""Provider 工厂 — 根据配置创建合适的 Provider"""

from typing import Any

from provider.base import BaseProvider
from provider.doubao import DoubaoProvider
from config import get_doubao_config


def create_provider(provider_name: str = "doubao", **kwargs) -> BaseProvider:
    """根据名称创建 Provider 实例"""
    if provider_name == "doubao":
        cfg = get_doubao_config()
        return DoubaoProvider(
            api_key=kwargs.get("api_key") or cfg["api_key"],
            base_url=kwargs.get("base_url") or cfg["base_url"],
            model=kwargs.get("model") or cfg["model"],
            timeout=kwargs.get("timeout", 120),
        )
    else:
        raise ValueError(f"Unknown provider: {provider_name}")
