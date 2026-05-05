"""
LLM Provider Factory

基于 LangChain BaseChatModel 的统一多模型入口。
当前所有适配均走 langchain-openai 的 ChatOpenAI（国内主流模型厂商
已全面提供 OpenAI 兼容 API）。如需对接非兼容厂商，在此扩展新分支。
"""
from enum import Enum
from typing import Optional

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI


class Provider(str, Enum):
    SILICON_FLOW = "silicon_flow"
    OPENAI = "openai"
    DEEPSEEK = "deepseek"
    ZHIPU = "zhipu"
    OPENAI_COMPATIBLE = "openai_compatible"


PROVIDER_DEFAULTS: dict[Provider, dict] = {
    Provider.SILICON_FLOW: {
        "base_url": "https://api.siliconflow.cn/v1",
        "default_model": "Qwen/Qwen2.5-7B-Instruct",
    },
    Provider.OPENAI: {
        "base_url": None,
        "default_model": "gpt-4o",
    },
    Provider.DEEPSEEK: {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
    },
    Provider.ZHIPU: {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
    },
    Provider.OPENAI_COMPATIBLE: {
        "base_url": None,
        "default_model": None,
    },
}

def get_llm(
    *,
    provider: Optional[Provider | str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    temperature: float = 0,
    timeout: int = 120,
    streaming: bool = True,
    max_tokens: Optional[int] = None,
    **kwargs,
) -> BaseChatModel:
    """
    获取 LangChain BaseChatModel 实例。

    参数优先级: 显式传参 > Settings(.env) > 内置默认值。

    使用示例:
        # 使用 .env 中配置的默认 provider
        llm = get_llm()

        # 显式切换到 DeepSeek
        llm = get_llm(provider="deepseek", model="deepseek-chat")

        # 任意 OpenAI 兼容厂商
        llm = get_llm(provider="openai_compatible", base_url="https://...", api_key="...")
    """
    from app.core.config import get_settings

    cfg = get_settings()

    # ---- resolve provider ----
    if provider is None:
        provider = Provider(cfg.llm_provider)
    elif isinstance(provider, str):
        provider = Provider(provider)
    defaults = PROVIDER_DEFAULTS.get(provider, {})

    # ---- resolve model ----
    resolved_model = model or cfg.llm_model or defaults.get("default_model")
    if resolved_model is None:
        raise ValueError(
            f"model 未指定，且 Provider '{provider.value}' 无默认模型。"
            f" 请传参 model=... 或在 .env 中设置 LLM_MODEL。"
        )

    # ---- resolve base_url ----
    resolved_base_url = base_url
    if resolved_base_url is None:
        resolved_base_url = cfg.silicon_flow_api_url or defaults.get("base_url")

    # ---- resolve api_key ----
    resolved_api_key = api_key or cfg.llm_api_key or cfg.silicon_flow_api_key
    if not resolved_api_key:
        provider_name = provider.value if isinstance(provider, Provider) else str(provider)
        raise ValueError(
            f"API Key 未配置。请在 .env 中设置 LLM_API_KEY（推荐）或 SILICON_FLOW_API_KEY，"
            f"或传参 api_key=..."
        )

    chat_kwargs: dict = dict(
        model=resolved_model,
        api_key=resolved_api_key,
        streaming=streaming,
        temperature=temperature,
        timeout=timeout,
    )
    if resolved_base_url:
        chat_kwargs["base_url"] = resolved_base_url
    if max_tokens is not None:
        chat_kwargs["max_tokens"] = max_tokens
    chat_kwargs.update(kwargs)

    return ChatOpenAI(**chat_kwargs)