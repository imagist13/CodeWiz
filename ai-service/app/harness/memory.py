"""
基于 LangChain 的多轮对话记忆系统
支持：按对话 ID 隔离、Token 计数（无外部网络依赖）、自动窗口截断、JSON 持久化
"""

import os
import sys
import json
import threading
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.chat_history import BaseChatMessageHistory

DEFAULT_MAX_TOKENS = 8000
DEFAULT_MAX_MESSAGES = 50

if sys.platform == "win32":
    MEMORY_STORE_DIR = os.path.join(
        os.environ.get("TEMP", "C:\\Windows\\Temp"),
        "codewiz-memory-store"
    )
else:
    MEMORY_STORE_DIR = os.environ.get("CODEWIZ_MEMORY_ROOT", "/tmp/codewiz-memory-store")


@dataclass
class MemoryConfig:
    max_tokens: int = DEFAULT_MAX_TOKENS
    max_messages: int = DEFAULT_MAX_MESSAGES
    enable_summarization: bool = False
    store_dir: str = MEMORY_STORE_DIR


def count_tokens_fast_estimate(text: str) -> int:
    """
    无网络依赖的快速 Token 估算函数
    平均 1 token ≈ 4 个英文字符 / 2 个中文字符
    """
    if not text:
        return 0
    total_chars = len(text)
    # 简单经验估算，无需任何外部依赖和网络请求
    return int(total_chars / 3.5) + 1


def count_langchain_message_tokens(msg: BaseMessage) -> int:
    """计算单个 LangChain 消息的 token 数，完全无网络依赖"""
    content_str = msg.content if isinstance(msg.content, str) else str(msg.content)
    total = count_tokens_fast_estimate(content_str)
    if hasattr(msg, "name") and msg.name:
        total += count_tokens_fast_estimate(msg.name)
    return total


def langchain_msg_to_dict(msg: BaseMessage) -> Dict[str, Any]:
    """将 LangChain BaseMessage 序列化到 dict"""
    return {
        "type": msg.type,
        "content": msg.content,
        "tool_call_id": getattr(msg, "tool_call_id", None),
        "name": getattr(msg, "name", None),
        "tool_calls": getattr(msg, "tool_calls", None)
    }


def dict_to_langchain_msg(d: Dict[str, Any]) -> BaseMessage:
    """从 dict 反序列化为 LangChain BaseMessage"""
    msg_type = d.get("type", "human")
    content = d.get("content", "")
    if msg_type == "system":
        return SystemMessage(content=content)
    elif msg_type == "ai":
        ai_msg = AIMessage(content=content)
        tc = d.get("tool_calls")
        if tc:
            ai_msg.tool_calls = tc
        return ai_msg
    elif msg_type == "tool":
        return ToolMessage(content=content, tool_call_id=d.get("tool_call_id", ""))
    else:
        return HumanMessage(content=content)


class PersistentChatMemory(BaseChatMessageHistory):
    """
    持久化的对话记忆，支持：
    - 按 conversation_id 独立隔离存储
    - 自动 JSON 落盘
    - Token 数超限自动截断
    - 完全无外部网络依赖
    """

    def __init__(self, conversation_id: str, config: Optional[MemoryConfig] = None):
        self.conversation_id = conversation_id
        self.config = config or MemoryConfig()
        self._messages: List[BaseMessage] = []
        os.makedirs(self.config.store_dir, exist_ok=True)
        self._store_path = os.path.join(self.config.store_dir, f"{conversation_id}.json")
        self._load()

    def _load(self) -> None:
        """从本地 JSON 文件加载历史消息"""
        if not os.path.exists(self._store_path):
            return
        try:
            with open(self._store_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._messages = [dict_to_langchain_msg(d) for d in data.get("messages", [])]
        except Exception as e:
            print(f"[Memory] Failed to load conversation {self.conversation_id}: {e}")
            self._messages = []

    def _save(self) -> None:
        """将当前消息列表持久化到 JSON"""
        try:
            data = {
                "conversation_id": self.conversation_id,
                "messages": [langchain_msg_to_dict(m) for m in self._messages]
            }
            with open(self._store_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Memory] Failed to save conversation {self.conversation_id}: {e}")

    @property
    def messages(self) -> List[BaseMessage]:
        return list(self._messages)

    def add_message(self, message: BaseMessage) -> None:
        self._messages.append(message)
        self._prune_if_needed()
        self._save()

    def clear(self) -> None:
        self._messages = []
        if os.path.exists(self._store_path):
            try:
                os.remove(self._store_path)
            except Exception:
                pass

    def total_tokens(self) -> int:
        """当前所有消息的总 Token 数"""
        return sum(count_langchain_message_tokens(m) for m in self._messages)

    def _prune_if_needed(self) -> None:
        """
        智能裁剪：从最老的非系统消息开始删，直到总 Token 数小于上限
        SystemMessage 永远保留在第一位
        """
        if len(self._messages) <= 1:
            return

        total_tok = self.total_tokens()
        if total_tok <= self.config.max_tokens and len(self._messages) <= self.config.max_messages:
            return

        system_msg = None
        others = self._messages
        if isinstance(self._messages[0], SystemMessage):
            system_msg = self._messages[0]
            others = self._messages[1:]

        # 从头部开始逐步删除旧消息，直到符合限制
        while others and (
            sum(count_langchain_message_tokens(m) for m in others) > self.config.max_tokens
            or len(others) > self.config.max_messages
        ):
            others.pop(0)

        self._messages = [system_msg] if system_msg else []
        self._messages.extend(others)


class ConversationMemoryManager:
    """全局单例的对话记忆管理器，负责所有会话的生命周期管理"""
    _instance: Optional["ConversationMemoryManager"] = None

    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self._memories: Dict[str, PersistentChatMemory] = {}
        self._lock = threading.RLock()

    def get_memory(self, conversation_id: str) -> PersistentChatMemory:
        """获取指定对话 ID 的记忆实例，不存在则自动创建"""
        with self._lock:
            if conversation_id not in self._memories:
                self._memories[conversation_id] = PersistentChatMemory(conversation_id, self.config)
            return self._memories[conversation_id]

    def delete_memory(self, conversation_id: str) -> bool:
        """删除指定对话的全部记忆"""
        with self._lock:
            if conversation_id in self._memories:
                self._memories[conversation_id].clear()
                del self._memories[conversation_id]
                return True
            p = os.path.join(self.config.store_dir, f"{conversation_id}.json")
            if os.path.exists(p):
                os.remove(p)
            return False

    def list_all_conversation_ids(self) -> List[str]:
        """列出所有已存储的对话 ID"""
        ids = []
        with self._lock:
            for fname in os.listdir(self.config.store_dir):
                if fname.endswith(".json"):
                    ids.append(fname[:-5])
        return ids


_global_memory_manager: Optional[ConversationMemoryManager] = None


def get_memory_manager() -> ConversationMemoryManager:
    global _global_memory_manager
    if _global_memory_manager is None:
        _global_memory_manager = ConversationMemoryManager()
    return _global_memory_manager
