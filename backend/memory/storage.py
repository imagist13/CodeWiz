"""MemoryStorage — 持久化记忆存储"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class MemoryStorage:
    """持久化记忆存储 — 支持 HOT/WARM/COLD 三层"""

    LAYER_HOT = "hot"
    LAYER_WARM = "warm"
    LAYER_COLD = "cold"

    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.memory_dir = self.storage_dir / "memory"
        self.memory_dir.mkdir(parents=True, exist_ok=True)

    def _layer_dir(self, layer: str) -> Path:
        d = self.memory_dir / layer
        d.mkdir(exist_ok=True)
        return d

    def save(
        self,
        layer: str,
        key: str,
        content: str,
        metadata: dict | None = None,
        ttl_seconds: int | None = None,
    ) -> str:
        """保存记忆"""
        memory_id = str(uuid.uuid4())[:8]
        entry = {
            "id": memory_id,
            "layer": layer,
            "key": key,
            "content": content,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "ttl": ttl_seconds,
        }
        layer_dir = self._layer_dir(layer)
        path = layer_dir / f"{key}_{memory_id}.json"
        path.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
        return memory_id

    def load(self, layer: str, key: str) -> list[dict]:
        """加载指定 layer 和 key 的记忆"""
        layer_dir = self._layer_dir(layer)
        results = []
        for f in layer_dir.glob(f"{key}_*.json"):
            try:
                results.append(json.loads(f.read_text(encoding="utf-8")))
            except Exception:
                continue
        return sorted(results, key=lambda x: x.get("created_at", ""), reverse=True)

    def list_all(self, layer: str | None = None) -> list[dict]:
        """列出所有记忆"""
        results = []
        layers = [layer] if layer else [self.LAYER_HOT, self.LAYER_WARM, self.LAYER_COLD]
        for lay in layers:
            layer_dir = self._layer_dir(lay)
            for f in layer_dir.glob("*.json"):
                try:
                    results.append(json.loads(f.read_text(encoding="utf-8")))
                except Exception:
                    continue
        return sorted(results, key=lambda x: x.get("created_at", ""), reverse=True)

    def delete(self, layer: str, memory_id: str) -> bool:
        """删除记忆"""
        layer_dir = self._layer_dir(layer)
        for f in layer_dir.glob(f"*_{memory_id}.json"):
            f.unlink()
            return True
        return False
