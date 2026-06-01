"""抽象 Provider 接口"""

from abc import ABC, abstractmethod
from typing import Generator, Any

from models.provider_schema import ProviderResponse


class BaseProvider(ABC):
    """LLM Provider 抽象基类"""

    last_response: ProviderResponse | None = None
    last_usage: dict | None = None
    stream: bool = False

    @abstractmethod
    def respond(self, messages: list[dict], tools: list[dict] | None = None) -> ProviderResponse:
        """非流式调用，返回统一响应"""
        ...

    @abstractmethod
    def respond_stream(
        self, messages: list[dict], tools: list[dict] | None = None
    ) -> Generator[dict, None, None]:
        """流式调用，yield 事件 dict"""
        ...
