"""CheckpointManager — 检查点保存与恢复"""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from models.pipeline import Phase, Checkpoint
from engine.io_utils import atomic_write_json


class CheckpointManager:
    """检查点管理 — 保存/恢复 Pipeline 运行状态"""

    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        session_id: str,
        phase: Phase,
        phase_data: dict,
        messages: list[dict],
        event_seq: int,
    ) -> Checkpoint:
        """保存检查点"""
        cp = Checkpoint(
            index=self._count(session_id),
            phase=phase,
            phase_data=dict(phase_data),
            messages=list(messages),
            event_seq=event_seq,
        )
        path = self._path(session_id, cp.index)
        atomic_write_json(path, cp.to_dict())
        return cp

    def restore(self, session_id: str, index: int) -> Checkpoint | None:
        """恢复检查点"""
        path = self._path(session_id, index)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return Checkpoint.from_dict(data)
        except (json.JSONDecodeError, IOError):
            return None

    def list_checkpoints(self, session_id: str) -> list[Checkpoint]:
        """列出所有检查点"""
        checkpoints = []
        for p in self.storage_dir.glob(f"cp_{session_id}_*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                checkpoints.append(Checkpoint.from_dict(data))
            except Exception:
                continue
        return sorted(checkpoints, key=lambda x: x.index)

    def _path(self, session_id: str, index: int) -> Path:
        return self.storage_dir / f"cp_{session_id}_{index}.json"

    def _count(self, session_id: str) -> int:
        return len(list(self.storage_dir.glob(f"cp_{session_id}_*.json")))
