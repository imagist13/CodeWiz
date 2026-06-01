"""PhaseGate — 阶段门控"""

from dataclasses import dataclass, field
from typing import Any

from models.pipeline import Phase, PhaseStatus, PHASE_ORDER


@dataclass
class PhaseGate:
    """阶段门控：控制流程推进顺序"""
    current_phase: Phase = Phase.CLARIFY
    phase_status: PhaseStatus = PhaseStatus.PENDING
    phase_data: dict[str, Any] = field(default_factory=dict)

    def can_proceed(self, target: Phase) -> bool:
        """检查是否可以进入下一阶段"""
        return PHASE_ORDER.index(target) >= PHASE_ORDER.index(self.current_phase)

    def advance(self, target: Phase, data: dict | None = None) -> None:
        """推进到指定阶段，保存阶段产物"""
        if not self.can_proceed(target):
            raise ValueError(f"无法从 {self.current_phase.value} 跳到 {target.value}")
        self.phase_data[self.current_phase.value] = data or {}
        self.current_phase = target
        self.phase_status = PhaseStatus.PENDING

    def rollback(self, target: Phase) -> dict:
        """回滚到指定阶段"""
        for p in reversed(PHASE_ORDER):
            if p == target:
                break
            self.phase_data.pop(p.value, None)
        self.current_phase = target
        self.phase_status = PhaseStatus.PAUSED
        return self.phase_data.get(target.value, {})

    def pause(self) -> None:
        self.phase_status = PhaseStatus.PAUSED

    def resume(self) -> None:
        self.phase_status = PhaseStatus.IN_PROGRESS

    def complete(self, data: dict | None = None) -> None:
        """标记当前阶段完成"""
        self.phase_data[self.current_phase.value] = data or {}
        self.phase_status = PhaseStatus.COMPLETED

    def next_phase(self) -> Phase | None:
        """获取下一阶段（如果存在）"""
        idx = PHASE_ORDER.index(self.current_phase)
        if idx + 1 < len(PHASE_ORDER):
            return PHASE_ORDER[idx + 1]
        return None
