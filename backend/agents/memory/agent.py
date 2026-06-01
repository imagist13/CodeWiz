"""MemoryAgent — 记忆管理子代理"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path


class MemoryStore:
    """持久化记忆存储"""

    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.memory_dir = self.storage_dir / "memory"
        self.memory_dir.mkdir(parents=True, exist_ok=True)

    def save(self, memory_type: str, key: str, content: str, metadata: dict | None = None) -> str:
        """保存记忆"""
        memory_id = str(uuid.uuid4())[:8]
        entry = {
            "id": memory_id,
            "type": memory_type,
            "key": key,
            "content": content,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        path = self.memory_dir / f"{memory_type}_{memory_id}.json"
        path.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
        return memory_id

    def recall(self, query: str, memory_type: str | None = None, top_k: int = 5) -> list[dict]:
        """召回相似记忆（简单关键词匹配）"""
        results = []
        query_keywords = set(query.lower().split())

        for f in self.memory_dir.glob("*.json"):
            if memory_type and not f.name.startswith(memory_type):
                continue
            try:
                entry = json.loads(f.read_text(encoding="utf-8"))
                content_words = set(entry.get("content", "").lower().split())
                score = len(query_keywords & content_words)
                if score > 0:
                    entry["_score"] = score
                    results.append(entry)
            except Exception:
                continue

        results.sort(key=lambda x: x.get("_score", 0), reverse=True)
        return results[:top_k]

    def list_all(self, memory_type: str | None = None) -> list[dict]:
        """列出所有记忆"""
        results = []
        for f in self.memory_dir.glob("*.json"):
            if memory_type and not f.name.startswith(memory_type):
                continue
            try:
                results.append(json.loads(f.read_text(encoding="utf-8")))
            except Exception:
                continue
        return sorted(results, key=lambda x: x.get("created_at", ""), reverse=True)
