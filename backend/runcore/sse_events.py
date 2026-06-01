"""
SSE event type definitions and structured event classes.

Inspired by codewiz-agent's gateway/protocol.py EventType enum.
All SSE events emitted by the pipeline are enumerated here.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Event Type Enum
# ---------------------------------------------------------------------------

class SSEEventType(str, Enum):
    """All SSE event types emitted by the Hermes pipeline.

    These are the 'event' field values in SSE data lines.
    """
    # Text/Thinking
    THINKING = "thinking"              # Extended thinking/reasoning output
    TEXT_CHUNK = "text_chunk"         # Streaming text fragment
    TEXT_DELTA = "text_delta"         # Alias for text_chunk (codewiz compat)

    # Message lifecycle
    MESSAGE_START = "message.start"   # A new assistant message has started
    MESSAGE_DELTA = "message.delta"   # Incremental content update
    MESSAGE_COMPLETE = "message.complete"  # Message fully received
    DONE = "done"                    # Final event of a response

    # Tool lifecycle (codewiz-style)
    TOOL_START = "tool.start"        # Tool execution beginning
    TOOL_PROGRESS = "tool.progress"  # Tool intermediate progress
    TOOL_END = "tool.end"            # Tool execution completed
    TOOL_ERROR = "tool.error"        # Tool execution failed

    # Hermes legacy events (kept for compat)
    TOOL_CALL = "tool_call"         # LLM requested a tool call
    TOOL_RESULT = "tool_result"      # Tool result ready

    # Pipeline phase events
    PHASE_START = "phase_start"      # Pipeline phase entered
    PHASE_END = "phase_end"          # Pipeline phase completed
    PHASE_PROGRESS = "phase_progress"  # Phase has progress info

    # Parallel tools
    PARALLEL_TOOLS = "parallel_tools"  # Tools running in parallel

    # Lint/Test results
    LINT_RESULT = "lint_result"     # Structured lint output
    TEST_RESULT = "test_result"     # Structured test output
    PIPELINE_SUMMARY = "pipeline_summary"  # End-of-pipeline summary

    # Error
    ERROR = "error"                 # Something went wrong
    WARNING = "warning"             # Non-fatal warning


# ---------------------------------------------------------------------------
# Pipeline Phase Enum
# ---------------------------------------------------------------------------

class PipelinePhase(str, Enum):
    """Stages of the Hermes pipeline."""
    CLARIFY = "clarify"           # Requirement clarification
    PLAN = "plan"                 # Solution design
    CODE = "code"                  # Code generation
    LINT = "lint"                 # Lint and test
    PR = "pr"                      # PR creation


# ---------------------------------------------------------------------------
# Structured Event Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class SSEEvent:
    """Base class for all structured SSE events."""
    event_type: SSEEventType

    def to_sse_line(self) -> str:
        """Serialize to a single SSE 'data:' line (JSON)."""
        import json
        data = self._asdict()
        return json.dumps(data, ensure_ascii=False)

    def _asdict(self) -> dict[str, Any]:
        d = asdict(self)
        d["event_type"] = self.event_type.value
        return d


@dataclass
class ThinkingEvent(SSEEvent):
    """Extended thinking/reasoning from the model."""
    event_type: SSEEventType = field(default=SSEEventType.THINKING)
    data: str = ""


@dataclass
class TextChunkEvent(SSEEvent):
    """Streaming text fragment."""
    event_type: SSEEventType = field(default=SSEEventType.TEXT_CHUNK)
    data: str = ""
    msg_id: Optional[str] = None


@dataclass
class ToolCallEvent(SSEEvent):
    """LLM requested a tool call (legacy Hermes format)."""
    event_type: SSEEventType = field(default=SSEEventType.TOOL_CALL)
    call_id: str = ""
    name: str = ""
    input: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolResultEvent(SSEEvent):
    """Tool execution result (legacy Hermes format)."""
    event_type: SSEEventType = field(default=SSEEventType.TOOL_RESULT)
    call_id: str = ""
    result: str = ""
    error: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolStartEvent(SSEEvent):
    """Tool execution started (codewiz compat)."""
    event_type: SSEEventType = field(default=SSEEventType.TOOL_START)
    tool_name: str = ""
    call_id: str = ""
    input: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolEndEvent(SSEEvent):
    """Tool execution completed (codewiz compat)."""
    event_type: SSEEventType = field(default=SSEEventType.TOOL_END)
    tool_name: str = ""
    call_id: str = ""
    success: bool = True
    content: str = ""
    error: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PhaseStartEvent(SSEEvent):
    """Pipeline phase entered."""
    event_type: SSEEventType = field(default=SSEEventType.PHASE_START)
    phase: PipelinePhase = PipelinePhase.CODE
    description: str = ""


@dataclass
class PhaseEndEvent(SSEEvent):
    """Pipeline phase completed."""
    event_type: SSEEventType = field(default=SSEEventType.PHASE_END)
    phase: PipelinePhase = PipelinePhase.CODE
    success: bool = True
    description: str = ""


@dataclass
class PhaseProgressEvent(SSEEvent):
    """Pipeline phase has progress information."""
    event_type: SSEEventType = field(default=SSEEventType.PHASE_PROGRESS)
    phase: PipelinePhase = PipelinePhase.CODE
    progress: float = 0.0
    description: str = ""
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParallelToolsEvent(SSEEvent):
    """Tools are running in parallel."""
    event_type: SSEEventType = field(default=SSEEventType.PARALLEL_TOOLS)
    tool_names: list[str] = field(default_factory=list)
    call_ids: list[str] = field(default_factory=list)


@dataclass
class LintResultEvent(SSEEvent):
    """Structured lint/test result."""
    event_type: SSEEventType = field(default=SSEEventType.LINT_RESULT)

    # Overall
    success: bool = False
    overall_pass: bool = False

    # Pass rates
    lint_pass_rate: float = 0.0
    test_pass_rate: float = 0.0

    # Counts
    lint_total: int = 0
    lint_passed: int = 0
    test_total: int = 0
    test_passed: int = 0

    # Details
    files_checked: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)
    stdout: str = ""
    stderr: str = ""

    # Metadata
    repo_name: str = ""
    duration_ms: int = 0


@dataclass
class PipelineSummaryEvent(SSEEvent):
    """End-of-pipeline summary."""
    event_type: SSEEventType = field(default=SSEEventType.PIPELINE_SUMMARY)
    phases_completed: list[str] = field(default_factory=list)
    total_duration_ms: int = 0
    lint_pass_rate: float = 0.0
    test_pass_rate: float = 0.0
    changed_files: list[str] = field(default_factory=list)
    pr_url: Optional[str] = None
    error: Optional[str] = None


@dataclass
class DoneEvent(SSEEvent):
    """Response stream complete."""
    event_type: SSEEventType = field(default=SSEEventType.DONE)


@dataclass
class ErrorEvent(SSEEvent):
    """An error occurred."""
    event_type: SSEEventType = field(default=SSEEventType.ERROR)
    data: str = ""


# ---------------------------------------------------------------------------
# Event serializer — converts any SSEEvent to SSE 'data:' JSON line
# ---------------------------------------------------------------------------

def event_to_sse(event: SSEEvent) -> str:
    """Serialize an SSEEvent to a SSE 'data:' line.

    This is the format the frontend SSE parser expects.
    """
    import json
    return json.dumps({"event": event.event_type.value, **event._asdict()})


def legacy_tool_call_to_event(call_id: str, name: str, inp: dict) -> str:
    """Emit a legacy-style tool_call event (backward compat)."""
    return f'{{"event": "tool_call", "call_id": "{call_id}", "name": "{name}", "input": {json.dumps(inp)}}}'


def legacy_tool_result_to_event(call_id: str, result: str, error: Optional[str] = None) -> str:
    """Emit a legacy-style tool_result event (backward compat)."""
    import json
    d = {"event": "tool_result", "call_id": call_id, "result": result}
    if error:
        d["error"] = error
    return json.dumps(d)
