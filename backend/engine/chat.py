"""ChatManager — 对话历史管理与 Token 预算控制"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator


MAX_HISTORY = 100  # 最大消息条数
MAX_TOKENS = 80000  # 保守估计


class ChatManager:
    """对话历史管理器，封装消息列表的构建、持久化、裁剪"""

    def __init__(self, session_id: str, storage_dir: str):
        self.session_id = session_id
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.messages: list[dict] = []
        self._load_history()

    def add_user_message(self, content: str) -> None:
        self.messages.append({
            "role": "user",
            "content": content,
            "_ts": datetime.now(timezone.utc).isoformat(),
        })

    def add_assistant_message(self, content: str, reasoning: str = "") -> None:
        msg = {
            "role": "assistant",
            "content": content,
            "_ts": datetime.now(timezone.utc).isoformat(),
        }
        if reasoning:
            msg["_reasoning"] = reasoning
        self.messages.append(msg)

    def add_tool_call_message(self, tool_calls: list, reasoning: str = "") -> None:
        self.messages.append({
            "role": "assistant",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": json.dumps(tc.input, ensure_ascii=False),
                    },
                }
                for tc in tool_calls
            ],
            "_reasoning": reasoning,
            "_ts": datetime.now(timezone.utc).isoformat(),
        })

    def add_tool_result_message(self, tool_call_id: str, content: str, success: bool) -> None:
        self.messages.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": content,
            "success": success,
            "_ts": datetime.now(timezone.utc).isoformat(),
        })

    def build_messages(self) -> list[dict]:
        """构建发送给 LLM 的消息列表（不含内部元字段）"""
        out = []
        for m in self.messages:
            filtered = {k: v for k, v in m.items() if not k.startswith("_")}
            out.append(filtered)
        return out

    def _load_history(self) -> None:
        path = self.storage_dir / f"{self.session_id}.json"
        if path.exists():
            try:
                with open(path, encoding="utf-8") as f:
                    self.messages = json.load(f)
            except (json.JSONDecodeError, IOError):
                self.messages = []

    def save_history(self) -> None:
        path = self.storage_dir / f"{self.session_id}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.messages, f, ensure_ascii=False, indent=2)

    def archive_now(self) -> None:
        """归档当前对话到 archive 目录"""
        from config import get_storage_path
        archive_dir = Path(get_storage_path()) / "archive"
        archive_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        src = self.storage_dir / f"{self.session_id}.json"
        dst = archive_dir / f"{self.session_id}_{ts}.json"
        if src.exists():
            import shutil
            shutil.copy(src, dst)
