"""Agent loop — multi-turn tool-use conversation with Anthropic API.

Mirrors src/lib/agent-loop.ts from the TypeScript codebase.

Protocol:
  - Receives user messages via JSON-RPC over stdin
  - Streams SSE events to stdout
  - Supports interrupt via SIGINT/SIGTERM

SSE event types (matches frontend contract):
  - status:    {"type":"status",    "data":"{...}"}
  - text:      {"type":"text",      "data":"..."}
  - thinking:  {"type":"thinking",  "data":"..."}
  - tool_use:  {"type":"tool_use",  "data":"{...}"}
  - tool_result: {"type":"tool_result", "data":"{...}"}
  - error:     {"type":"error",     "data":"{...}"}
  - done:      {"type":"done",      "data":""}

JSON-RPC over stdin (session mode):
  {"jsonrpc":"2.0","id":1,"method":"message","params":{"prompt":"..."}}
  {"jsonrpc":"2.0","id":2,"method":"interrupt","params":{}}
  {"jsonrpc":"2.0","id":3,"method":"reset","params":{}}
"""

from __future__ import annotations

import json
import os
import signal
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator
from pathlib import Path

import anthropic

from codepilot_agent.session import (
    Message,
    Session,
    get_or_create_session,
    get_session,
    delete_session,
    clear_all_sessions,
)
from codepilot_agent.tools import get_tool, get_tool_schemas, ToolError, TOOLS
from codepilot_agent.provider import resolve_provider


# ── Constants ─────────────────────────────────────────────────────────────────

DEFAULT_MAX_STEPS = 50
DOOM_LOOP_THRESHOLD = 3
KEEPALIVE_INTERVAL_MS = 15_000

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful AI coding assistant. You have access to tools to read, "
    "write, edit, and execute code. Think carefully before each action. "
    "Prefer using existing code patterns and conventions in the codebase. "
    "Always prefer reading files over guessing. "
    "Use Bash to run tests, linters, and build commands to verify your changes."
)


# ── SSE Helpers ────────────────────────────────────────────────────────────────

def _sse(event_type: str, data: str) -> str:
    return f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"


def _sse_json(event_type: str, data: dict) -> str:
    return _sse(event_type, json.dumps(data))


def _emit(line: str) -> None:
    sys.stdout.write(line)
    sys.stdout.flush()


# ── Agent Options ──────────────────────────────────────────────────────────────

@dataclass
class AgentOptions:
    session_id: str
    model: str
    api_key: str
    base_url: str | None = None
    system_prompt: str | None = None
    working_directory: str = ""
    max_steps: int = DEFAULT_MAX_STEPS
    protocol: str = "anthropic"
    thinking: dict | None = None
    abort_signal: threading.Event | None = None
    abort_callback: callable | None = None


# ── Tool Execution ─────────────────────────────────────────────────────────────

@dataclass
class ToolCall:
    id: str
    name: str
    input_json: str  # Raw JSON string of input
    input_dict: dict  # Parsed

    @classmethod
    def from_raw(cls, id: str, name: str) -> ToolCall:
        return cls(id=id, name=name, input_json="", input_dict={})


@dataclass
class ToolResult:
    tool_use_id: str
    content: str
    is_error: bool = False


# ── Agent ─────────────────────────────────────────────────────────────────────

class Agent:
    """Stateful agent loop — one per session."""

    def __init__(self, options: AgentOptions) -> None:
        self.options = options
        self._client = anthropic.Anthropic(
            api_key=options.api_key,
            **( {"base_url": options.base_url} if options.base_url else {} ),
        )
        self._session: Session = get_or_create_session(
            options.session_id,
            options.model,
            options.system_prompt or DEFAULT_SYSTEM_PROMPT,
        )
        self._step = 0
        self._aborted = False
        self._last_tool_names: list[str] = []

    # ── SSE Emitters ───────────────────────────────────────────────────────────

    def _emit_status(
        self,
        model: str | None = None,
        tools: list[str] | None = None,
    ) -> None:
        _emit(_sse_json("status", {
            "session_id": self.options.session_id,
            "model": model or self.options.model,
            "tools": tools or list(TOOLS.keys()),
            "output_style": "python-agent",
        }))

    def _emit_text(self, text: str) -> None:
        _emit(_sse("text", text))

    def _emit_thinking(self, text: str) -> None:
        _emit(_sse("thinking", text))

    def _emit_tool_use(self, tool_call: ToolCall) -> None:
        _emit(_sse_json("tool_use", {
            "id": tool_call.id,
            "name": tool_call.name,
            "input": tool_call.input_dict,
        }))

    def _emit_tool_result(self, result: ToolResult) -> None:
        _emit(_sse_json("tool_result", {
            "tool_use_id": result.tool_use_id,
            "content": result.content,
            "is_error": result.is_error,
        }))

    def _emit_error(self, message: str, category: str = "AGENT_ERROR") -> None:
        _emit(_sse_json("error", {
            "category": category,
            "userMessage": message,
            "details": message,
            "rawMessage": message,
            "_formattedMessage": message,
        }))

    def _emit_done(self) -> None:
        _emit(_sse("done", ""))

    def _emit_result(self, usage: dict, num_turns: int) -> None:
        _emit(_sse_json("result", {
            "usage": usage,
            "session_id": self.options.session_id,
            "num_turns": num_turns,
        }))

    # ── API Call ───────────────────────────────────────────────────────────────

    def _build_api_messages(self) -> list[dict]:
        """Build messages for API, with system prompt."""
        messages = self._session.to_api_messages()

        # If first message isn't a user message and no system, add user prompt
        if not messages:
            return messages

        return messages

    def _system_param(self) -> str | None:
        """Return system prompt as a single string."""
        return self.options.system_prompt or DEFAULT_SYSTEM_PROMPT

    def _build_call_kwargs(self) -> dict[str, Any]:
        """Build API call kwargs including tool config."""
        tool_schemas = get_tool_schemas()
        thinking_cfg = self.options.thinking

        kwargs: dict[str, Any] = {
            "model": self.options.model,
            "max_tokens": 8192,
            "system": self._system_param(),
            "tools": tool_schemas,
        }

        if thinking_cfg:
            th = thinking_cfg
            if th.get("type") == "enabled":
                budget = th.get("budget_tokens", 1024)
                kwargs["thinking"] = anthropic.types.ThinkingConfigEnabledParam(budget_tokens=budget)
            elif th.get("type") == "disabled":
                kwargs["thinking"] = anthropic.types.ThinkingConfigDisabledParam()
            elif th.get("type") == "adaptive":
                kwargs["thinking"] = anthropic.types.ThinkingConfigEnabledParam()

        return kwargs

    # ── Tool Execution ─────────────────────────────────────────────────────────

    def _execute_tool(self, tool_call: ToolCall) -> ToolResult:
        """Execute a single tool call and return the result."""
        tool_def = get_tool(tool_call.name)
        if not tool_def:
            return ToolResult(
                tool_use_id=tool_call.id,
                content=f"Error: Unknown tool '{tool_call.name}'. Available: {list(TOOLS.keys())}",
                is_error=True,
            )

        ctx = {
            "working_directory": self.options.working_directory or os.getcwd(),
            "abort_signal": self.options.abort_signal,
        }

        try:
            # Parse input if we have raw JSON
            if tool_call.input_dict:
                tool_input = tool_call.input_dict
            elif tool_call.input_json:
                tool_input = json.loads(tool_call.input_json)
            else:
                tool_input = {}

            result = tool_def.execute(ctx, tool_input)
            return ToolResult(tool_use_id=tool_call.id, content=result, is_error=False)
        except ToolError as e:
            return ToolResult(tool_use_id=tool_call.id, content=str(e), is_error=True)
        except json.JSONDecodeError as e:
            return ToolResult(
                tool_use_id=tool_call.id,
                content=f"Error: Invalid tool input JSON: {e}",
                is_error=True,
            )
        except Exception as e:  # noqa: BLE001
            return ToolResult(
                tool_use_id=tool_call.id,
                content=f"Error: {type(e).__name__}: {e}",
                is_error=True,
            )

    # ── Stream Processing ──────────────────────────────────────────────────────

    def _stream_response(self) -> Iterator[tuple[str, Any]]:
        """Stream the API response and yield events.

        Yields:
            Tuples of (event_type, event_data).
            event_type: "text" | "thinking" | "tool_call" | "tool_result" | "error" | "done"
        """
        # Build messages from session
        messages = self._build_api_messages()

        call_kwargs = self._build_call_kwargs()
        call_kwargs["messages"] = messages if messages else [{"role": "user", "content": "(start)"}]

        if self._aborted:
            return

        try:
            with self._client.messages.stream(**call_kwargs) as stream:
                # Accumulators for current turn
                current_tool_call: ToolCall | None = None
                tool_call_input_parts: list[str] = []
                collected_tool_calls: list[ToolCall] = []
                assistant_text_parts: list[str] = []
                thinking_parts: list[str] = []
                input_tokens = 0
                output_tokens = 0

                for event in stream:
                    etype = event.type

                    if etype == "message_start":
                        input_tokens = event.message.usage.input_tokens

                    elif etype == "content_block_start":
                        block = event.content_block
                        btype = block.type if hasattr(block, "type") else getattr(block, "block_type", None)
                        if btype == "tool_use":
                            tool_name = getattr(block, "name", "unknown")
                            tool_id = getattr(block, "id", str(uuid.uuid4()))
                            current_tool_call = ToolCall.from_raw(tool_id, tool_name)
                            tool_call_input_parts = []

                    elif etype == "content_block_delta":
                        delta = event.delta
                        dtype = getattr(delta, "type", None)
                        if dtype == "text_delta":
                            text = delta.text
                            if text:
                                assistant_text_parts.append(text)
                                yield "text", delta.text
                        elif dtype == "thinking_delta":
                            text = delta.thinking
                            if text:
                                thinking_parts.append(text)
                                yield "thinking", text
                        elif dtype == "input_json_delta":
                            tool_call_input_parts.append(delta.partial_json)

                    elif etype == "content_block_end":
                        block = event.content_block
                        btype = getattr(block, "type", None) or getattr(block, "block_type", None)
                        if btype == "tool_use" and current_tool_call is not None:
                            # Parse accumulated input
                            raw_input = "".join(tool_call_input_parts)
                            try:
                                # Use anthropic's raw dict parser
                                input_dict = _parse_raw_json(raw_input)
                            except Exception:
                                input_dict = {}
                            current_tool_call.input_json = raw_input
                            current_tool_call.input_dict = input_dict
                            collected_tool_calls.append(current_tool_call)
                            current_tool_call = None
                            tool_call_input_parts = []

                    elif etype == "message_delta":
                        output_tokens = getattr(event.usage, "output_tokens", 0) or 0

                # Store assistant message in session
                full_text = "".join(assistant_text_parts)
                if full_text.strip():
                    self._session.add_assistant_message(full_text)

                # Emit all tool results in order
                for tc in collected_tool_calls:
                    yield "tool_call", tc

        except anthropic.APIError as e:
            yield "error", {"category": "API_ERROR", "message": str(e)}
        except anthropic.RateLimitError as e:
            yield "error", {"category": "RATE_LIMIT", "message": str(e)}
        except anthropic.AuthenticationError as e:
            yield "error", {"category": "AUTH_ERROR", "message": str(e)}
        except Exception as e:  # noqa: BLE001
            yield "error", {"category": "UNKNOWN_ERROR", "message": str(e)}

    # ── Main Loop ─────────────────────────────────────────────────────────────

    def run(self, user_prompt: str) -> None:
        """Run the agent loop for a single user prompt."""
        # Add user message to session
        self._session.add_user_message(user_prompt)
        self._step = 0

        # Emit status
        self._emit_status()

        # Agent loop
        while self._step < self.options.max_steps:
            self._step += 1

            # Check abort
            if self._aborted or (
                self.options.abort_signal is not None and self.options.abort_signal.is_set()
            ):
                self._aborted = True
                break

            tool_calls_this_step: list[ToolCall] = []
            has_text = False

            # Stream response from API
            for event_type, event_data in self._stream_response():
                if self._aborted:
                    break

                if event_type == "text":
                    has_text = True

                elif event_type == "thinking":
                    pass  # Already yielded via _emit_thinking in _stream_response

                elif event_type == "tool_call":
                    tool_call: ToolCall = event_data
                    self._emit_tool_use(tool_call)
                    tool_calls_this_step.append(tool_call)

                elif event_type == "error":
                    self._emit_error(event_data["message"], event_data["category"])
                    self._session.clear_interrupted()
                    self._emit_done()
                    return

            # Check abort after streaming
            if self._aborted:
                break

            # If no tool calls, we're done
            if not tool_calls_this_step:
                if not has_text:
                    # Empty response
                    self._emit_error(
                        "模型未返回任何内容。可能是 API 代理不兼容或模型不支持工具调用。",
                        "EMPTY_RESPONSE",
                    )
                self._session.clear_interrupted()
                self._emit_result(
                    {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0},
                    self._step,
                )
                self._emit_done()
                return

            # Doom loop detection
            tool_names = sorted([tc.name for tc in tool_calls_this_step])
            last_names = sorted(self._last_tool_names)
            if tool_names == last_names and len(tool_names) > 0:
                # Same tools called again — check if we should break
                # For now, allow up to MAX_STEPS
                pass
            self._last_tool_names = tool_names

            # Execute all tools
            for tc in tool_calls_this_step:
                if self._aborted:
                    break

                result = self._execute_tool(tc)
                self._emit_tool_result(result)

                # Add tool result to session
                self._session.add_tool_result(
                    tool_call_id=tc.id,
                    tool_name=tc.name,
                    tool_input=tc.input_dict,
                    content=result.content,
                )

        # Max steps reached
        self._session.clear_interrupted()
        self._emit_result(
            {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0},
            self._step,
        )
        self._emit_done()

    def interrupt(self) -> None:
        self._aborted = True


# ── JSON Parsing Helper ────────────────────────────────────────────────────────

def _parse_raw_json(raw: str) -> dict:
    """Parse a raw JSON string that may be an incomplete object."""
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to find the last complete object
        stripped = raw.strip()
        if stripped.startswith("{") and not stripped.endswith("}"):
            # Try to find complete key-value pairs
            depth = 0
            end = 0
            for i, c in enumerate(stripped):
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end > 0:
                try:
                    return json.loads(stripped[:end])
                except json.JSONDecodeError:
                    pass
        return {}


# ── Session Mode Runner ───────────────────────────────────────────────────────

def run_session_mode() -> None:
    """Read JSON-RPC commands from stdin and run agent loop.

    Protocol:
      Input:  {"jsonrpc":"2.0","id":1,"method":"init","params":{...}}
              {"jsonrpc":"2.0","id":2,"method":"message","params":{"prompt":"..."}}
              {"jsonrpc":"2.0","id":3,"method":"interrupt","params":{}}
              {"jsonrpc":"2.0","id":4,"method":"reset","params":{}}
              {"jsonrpc":"2.0","id":5,"method":"delete","params":{}}

      Output: SSE events on stdout
              {"jsonrpc":"2.0","id":N,"result":{...}} on stdout
              {"jsonrpc":"2.0","id":N,"error":{...}} on stdout
    """

    abort_event = threading.Event()
    agent_ref: Agent | None = None

    def _handle_signal(sig, frame):
        if agent_ref:
            agent_ref.interrupt()
        abort_event.set()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # Read lines from stdin
    import sys
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            _respond_error(None, -32700, "Parse error", f"Invalid JSON: {line[:100]}")
            continue

        method = req.get("method", "")
        req_id = req.get("id")
        params = req.get("params", {})

        if method == "init":
            _handle_init(req_id, params, abort_event)
        elif method == "message":
            _handle_message(req_id, params, abort_event)
        elif method == "interrupt":
            _handle_interrupt(req_id, agent_ref)
        elif method == "reset":
            _handle_reset(req_id, params)
        elif method == "delete":
            _handle_delete(req_id, params)
        else:
            _respond_error(req_id, -32601, "Method not found", f"Unknown method: {method}")


def _resolve_credentials(
    env_api_key: str | None,
    env_base_url: str | None,
    provider_id: str | None,
    protocol: str | None,
    provider_name: str | None,
    model: str | None,
) -> tuple[str, str | None, str, str]:
    """Resolve API credentials from env vars + settings.json."""
    try:
        provider = resolve_provider(
            env_api_key=env_api_key,
            env_base_url=env_base_url,
            provider_id=provider_id,
            protocol=protocol,
            provider_name=provider_name,
            model=model,
        )
        return provider.api_key, provider.base_url, provider.protocol, provider.model
    except ValueError as e:
        _emit(_sse_json("error", {
            "category": "NO_CREDENTIALS",
            "userMessage": str(e),
            "details": str(e),
        }))
        _emit(_sse("done", ""))
        raise


def _handle_init(req_id: Any, params: dict, abort_event: threading.Event) -> None:
    """Initialize a session."""
    global _active_agent
    session_id = params.get("session_id", str(uuid.uuid4()))
    model = params.get("model") or "claude-sonnet-4-6"
    working_dir = params.get("working_directory", os.getcwd())

    # Resolve credentials
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
    base_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get("ANTHROPIC_BASE_URL") or None

    if not api_key:
        try:
            api_key, base_url, protocol, model = _resolve_credentials(
                env_api_key=None,
                env_base_url=None,
                provider_id=params.get("provider_id"),
                protocol=params.get("protocol"),
                provider_name=params.get("provider_name"),
                model=params.get("model"),
            )
        except Exception as e:
            _respond_error(req_id, -32000, "Init failed", str(e))
            return

    options = AgentOptions(
        session_id=session_id,
        model=model,
        api_key=api_key,
        base_url=base_url,
        system_prompt=params.get("system_prompt"),
        working_directory=working_dir,
        max_steps=params.get("max_steps", DEFAULT_MAX_STEPS),
        protocol=params.get("protocol", "anthropic"),
        thinking=params.get("thinking"),
        abort_signal=abort_event,
    )

    _active_agent = Agent(options)
    _respond_ok(req_id, {"session_id": session_id, "model": model})


def _handle_message(req_id: Any, params: dict, abort_event: threading.Event) -> None:
    """Run a single message in the agent loop."""
    global _active_agent

    if _active_agent is None:
        # Auto-init with default params
        session_id = params.get("session_id", str(uuid.uuid4()))
        model = params.get("model") or "claude-sonnet-4-6"
        working_dir = params.get("working_directory", os.getcwd())

        api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
        base_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get("ANTHROPIC_BASE_URL") or None

        if not api_key:
            try:
                api_key, base_url, protocol, model = _resolve_credentials(
                    env_api_key=None,
                    env_base_url=None,
                    provider_id=params.get("provider_id"),
                    protocol=params.get("protocol"),
                    provider_name=params.get("provider_name"),
                    model=params.get("model"),
                )
            except Exception as e:
                _respond_error(req_id, -32000, "Message failed", str(e))
                return

        options = AgentOptions(
            session_id=session_id,
            model=model,
            api_key=api_key,
            base_url=base_url,
            system_prompt=params.get("system_prompt"),
            working_directory=working_dir,
            max_steps=params.get("max_steps", DEFAULT_MAX_STEPS),
            protocol=params.get("protocol", "anthropic"),
            thinking=params.get("thinking"),
            abort_signal=abort_event,
        )
        _active_agent = Agent(options)

    prompt = params.get("prompt", "")
    if not prompt:
        _respond_error(req_id, -32602, "Invalid params", "prompt is required")
        return

    _respond_ok(req_id, {"status": "started"})

    try:
        _active_agent.run(prompt)
    except Exception as e:  # noqa: BLE001
        _emit(_sse_json("error", {
            "category": "AGENT_ERROR",
            "userMessage": str(e),
            "details": str(e),
        }))
        _emit(_sse("done", ""))


def _handle_interrupt(req_id: Any, agent: Agent | None) -> None:
    """Interrupt the current agent loop."""
    if agent:
        agent.interrupt()
    _respond_ok(req_id, {"status": "interrupted"})


def _handle_reset(req_id: Any, params: dict) -> None:
    """Reset (clear) a session."""
    session_id = params.get("session_id")
    global _active_agent

    if session_id:
        delete_session(session_id)
        if _active_agent and _active_agent.options.session_id == session_id:
            _active_agent = None
    else:
        clear_all_sessions()
        _active_agent = None

    _respond_ok(req_id, {"status": "reset"})


def _handle_delete(req_id: Any, params: dict) -> None:
    """Delete a session."""
    session_id = params.get("session_id")
    if session_id:
        delete_session(session_id)
    _respond_ok(req_id, {"status": "deleted"})


# ── JSON-RPC Response Helpers ──────────────────────────────────────────────────

def _respond_ok(req_id: Any, result: dict) -> None:
    msg = {"jsonrpc": "2.0", "id": req_id, "result": result}
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def _respond_error(req_id: Any, code: int, message: str, data: str = "") -> None:
    msg = {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message, "data": data}}
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


# ── Module-level State ─────────────────────────────────────────────────────────

_active_agent: Agent | None = None
