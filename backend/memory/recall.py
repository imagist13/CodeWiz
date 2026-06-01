"""MemoryRecall — 相似记忆召回"""

import json
from pathlib import Path


class MemoryRecall:
    """基于关键词的相似记忆召回"""

    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir) / "memory"

    def recall(self, query: str, top_k: int = 5) -> list[dict]:
        """关键词匹配召回"""
        results = []
        query_words = set(query.lower().split())

        if not self.storage_dir.exists():
            return results

        for layer_dir in self.storage_dir.iterdir():
            if not layer_dir.is_dir():
                continue
            for f in layer_dir.glob("*.json"):
                try:
                    entry = json.loads(f.read_text(encoding="utf-8"))
                    content_words = set(entry.get("content", "").lower().split())
                    score = len(query_words & content_words)
                    if score > 0:
                        entry["_layer"] = layer_dir.name
                        entry["_score"] = score
                        results.append(entry)
                except Exception:
                    continue

        results.sort(key=lambda x: x.get("_score", 0), reverse=True)
        return results[:top_k]
