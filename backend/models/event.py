"""Pipeline 事件类型定义"""

from enum import Enum


class PipelineEventType(str, Enum):
    # 澄清阶段
    CLARIFY_QUESTION = "clarify_question"
    CLARIFY_ANSWERED = "clarify_answered"
    CLARIFY_COMPLETE = "clarify_complete"

    # 方案阶段
    PLAN_PROPOSED = "plan_proposed"
    PLAN_APPROVED = "plan_approved"
    PLAN_REVISED = "plan_revised"

    # 工具调用（复用 engine 事件）
    TOOL_CALL = "tool_call"
    TEXT_CHUNK = "text_chunk"
    TEXT_DONE = "text_done"
    THINKING_CHUNK = "thinking_chunk"
    THINKING_DONE = "thinking_done"
    USAGE = "usage"
    ERROR = "error"
    MAX_ROUNDS = "max_rounds"
    DEADLOCK_WARNING = "deadlock_warning"

    # 检查点
    CHECKPOINT_SAVED = "checkpoint_saved"
    CHECKPOINT_RESTORED = "checkpoint_restored"

    # 验证阶段
    LINT_RESULT = "lint_result"
    TEST_RESULT = "test_result"
    VERIFY_PASS = "verify_pass"
    VERIFY_FAIL = "verify_fail"

    # 提交阶段
    PR_CREATED = "pr_created"
    PHASE_COMPLETE = "phase_complete"
    DONE = "done"

    # 阶段切换
    PHASE_CHANGED = "phase_changed"
