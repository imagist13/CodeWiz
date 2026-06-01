"""PipelineStateManager — Pipeline 状态持久化管理"""

import json
from pathlib import Path

from models.pipeline import PipelineState, Phase
from engine.io_utils import atomic_write_json


class PipelineStateManager:
    """Pipeline 状态持久化"""

    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _state_path(self, session_id: str) -> Path:
        return self.storage_dir / f"pipeline_{session_id}.json"

    def save(self, state: PipelineState) -> None:
        atomic_write_json(self._state_path(state.session_id), state.to_dict())

    def load(self, session_id: str) -> PipelineState | None:
        path = self._state_path(session_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return PipelineState.from_dict(data)
        except (json.JSONDecodeError, IOError, KeyError):
            return None

    def create(self, session_id: str) -> PipelineState:
        state = PipelineState(session_id=session_id)
        self.save(state)
        return state

    def list_sessions(self) -> list[str]:
        return [p.stem.replace("pipeline_", "") for p in self.storage_dir.glob("pipeline_*.json")]
