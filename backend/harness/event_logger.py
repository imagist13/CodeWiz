"""EventLogger — 事件拦截与持久化"""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Any


class EventLogger:
    """
    事件拦截器 — 包装 engine.run_chat_turn，
    拦截所有事件并实时追加写入 JSONL（原子写入防止断电丢失）
    """

    def __init__(self, session_id: str, storage_dir: str):
        self.session_id = session_id
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._file_path = self.storage_dir / f"{session_id}.jsonl"
        self._seq = 0
        self.events: list[dict] = []

    def _append(self, event: dict) -> None:
        """原子追加写入 JSONL"""
        enriched = {
            **event,
            "_ts": datetime.now(timezone.utc).isoformat(),
            "_seq": self._seq,
        }
        self._seq += 1
        self.events.append(enriched)

        fd, tmp = tempfile.mkstemp(
            dir=str(self.storage_dir),
            prefix=".tmp-",
            suffix=".jsonl",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(enriched, f, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, self._file_path)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def run(self, event_generator: Generator[dict, None, None]) -> Generator[dict, None, None]:
        """包装事件生成器，拦截并持久化"""
        for event in event_generator:
            self._append(event)
            yield event

    def get_events(self) -> list[dict]:
        """读取完整事件流"""
        if not self._file_path.exists():
            return self.events
        events = []
        with open(self._file_path, encoding="utf-8") as f:
            for line in f:
                events.append(json.loads(line))
        return events

    def get_events_by_type(self, etype: str) -> list[dict]:
        return [e for e in self.get_events() if e.get("type") == etype]

    def get_stats(self) -> dict:
        """获取统计信息"""
        events = self.get_events()
        tool_calls = [e for e in events if e.get("type") == "tool_call"]
        usages = [e for e in events if e.get("type") == "usage"]

        total_tokens = sum(u.get("total_tokens", 0) for u in usages)
        total_ms = sum(u.get("elapsed_ms", 0) for u in tool_calls)

        return {
            "session_id": self.session_id,
            "total_events": len(events),
            "tool_call_count": len(tool_calls),
            "total_tokens": total_tokens,
            "total_tool_ms": total_ms,
            "first_event_ts": events[0].get("_ts") if events else None,
            "last_event_ts": events[-1].get("_ts") if events else None,
        }
