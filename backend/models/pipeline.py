"""Pipeline 状态数据模型"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class Phase(str, Enum):
    """流程阶段枚举"""
    CLARIFY = "clarify"
    PLAN = "plan"
    LOCATE = "locate"
    GENERATE = "generate"
    VERIFY = "verify"
    COMMIT = "commit"


class PhaseStatus(str, Enum):
    """阶段状态"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


PHASE_ORDER = list(Phase)


@dataclass
class Checkpoint:
    """检查点快照"""
    index: int
    phase: Phase
    phase_data: dict[str, Any]
    messages: list[dict]
    event_seq: int
    saved_at: str = ""

    def __post_init__(self):
        if not self.saved_at:
            self.saved_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "phase": self.phase.value,
            "phase_data": self.phase_data,
            "messages": self.messages,
            "event_seq": self.event_seq,
            "saved_at": self.saved_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Checkpoint":
        return cls(
            index=d["index"],
            phase=Phase(d["phase"]),
            phase_data=d["phase_data"],
            messages=d["messages"],
            event_seq=d["event_seq"],
            saved_at=d.get("saved_at", ""),
        )


@dataclass
class PipelineState:
    """Pipeline 全局状态"""
    session_id: str
    requirement: dict | None = None  # Requirement DSL dict
    phase: Phase = Phase.CLARIFY
    phase_status: PhaseStatus = PhaseStatus.PENDING
    phase_data: dict[str, Any] = field(default_factory=dict)
    checkpoints: dict[int, Checkpoint] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        if not self.created_at:
            ts = datetime.now(timezone.utc)
            self.created_at = ts.isoformat()
            self.updated_at = ts.isoformat()

    def can_proceed(self, target: Phase) -> bool:
        return PHASE_ORDER.index(target) >= PHASE_ORDER.index(self.phase)

    def advance(self, target: Phase, data: dict | None = None) -> None:
        if not self.can_proceed(target):
            raise ValueError(f"无法从 {self.phase.value} 跳到 {target.value}")
        self.phase_data[self.phase.value] = data or {}
        self.phase = target
        self.phase_status = PhaseStatus.PENDING
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def rollback(self, target: Phase) -> dict:
        for p in reversed(PHASE_ORDER):
            if p == target:
                break
            self.phase_data.pop(p.value, None)
        self.phase = target
        self.phase_status = PhaseStatus.PAUSED
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return self.phase_data.get(target.value, {})

    def add_checkpoint(self, messages: list[dict], event_seq: int) -> int:
        idx = len(self.checkpoints)
        self.checkpoints[idx] = Checkpoint(
            index=idx,
            phase=self.phase,
            phase_data=dict(self.phase_data),
            messages=list(messages),
            event_seq=event_seq,
        )
        return idx

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "requirement": self.requirement,
            "phase": self.phase.value,
            "phase_status": self.phase_status.value,
            "phase_data": self.phase_data,
            "checkpoints": {k: v.to_dict() for k, v in self.checkpoints.items()},
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "PipelineState":
        state = cls(
            session_id=d["session_id"],
            requirement=d.get("requirement"),
            phase=Phase(d["phase"]),
            phase_status=PhaseStatus(d.get("phase_status", "pending")),
            phase_data=d.get("phase_data", {}),
            created_at=d.get("created_at", ""),
            updated_at=d.get("updated_at", ""),
        )
        for k, v in d.get("checkpoints", {}).items():
            state.checkpoints[int(k)] = Checkpoint.from_dict(v)
        return state
