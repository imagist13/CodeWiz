"""LLM provider factory — supports MiniMax, OpenAI, DeepSeek, Anthropic."""
from __future__ import annotations

from typing import Any, Optional

from runcore.llm.base import LLMProvider


def create_provider(
    provider_type: str,
    api_key: str,
    model: str,
    base_url: Optional[str] = None,
    **kwargs,
) -> LLMProvider:
    """Factory: return the appropriate LLM provider instance."""
    if provider_type == 'minimax':
        from runcore.llm.openai_adapter import OpenAIProvider
        return OpenAIProvider(
            api_key,
            model,
            provider='minimax',
            base_url=base_url or 'https://api.minimax.chat/v1',
            **kwargs,
        )
    elif provider_type in ('openai', 'deepseek'):
        from runcore.llm.openai_adapter import OpenAIProvider
        return OpenAIProvider(
            api_key,
            model,
            provider=provider_type,
            base_url=base_url,
            **kwargs,
        )
    elif provider_type == 'anthropic':
        from runcore.llm.anthropic_adapter import AnthropicProvider
        return AnthropicProvider(api_key, model, base_url=base_url, **kwargs)
    else:
        raise ValueError(f"Unknown provider: {provider_type}. Supported: minimax, openai, deepseek, anthropic")
