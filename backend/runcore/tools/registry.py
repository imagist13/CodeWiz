"""
Async parallel tool registry and executor.

Inspired by codewiz-agent's agent.py tool execution model.
Tools are executed in parallel when they have no dependencies.
"""
from __future__ import annotations

import asyncio
import inspect
import json
import logging
import threading
from concurrent.futures import Future
from dataclasses import dataclass
from typing import Any, Callable, Optional

from runcore.tools.base import Tool, ToolResult, dict_to_result
from runcore.tools.pool import get_tool_runner

log = logging.getLogger(__name__)

# Tools that must run alone in each round (no parallelization).
# References both legacy names (skills still use them) and new unified names.
SEQUENTIAL_TOOLS = {
    "bash",             # State-changing, could affect other tools
    "write_file",       # Legacy: file write
    "delete_file",      # Legacy: file delete
    "file_ops",         # Unified: includes write/delete/move operations
    "git_commit",       # Git operations
    "git_clone",        # Network + disk
    "lint_and_test",    # Runs npm, changes filesystem
    "git_commit_and_pr", # Network + git
}


@dataclass
class ToolExecution:
    """Result of a tool execution."""
    tool_name: str
    call_id: str
    arguments: dict[str, Any]
    result: ToolResult


class AsyncToolRegistry:
    """Async parallel tool registry and executor.

    Wraps the legacy synchronous registry while providing:
    - Async tool execution
    - Parallel execution for independent tools
    - Per-user thread pool isolation
    - Schema validation
    - Legacy tool backward compatibility
    """

    _instance: Optional["AsyncToolRegistry"] = None
    _lock = threading.Lock()

    def __init__(self):
        self._tools: dict[str, Tool] = {}
        self._legacy_handlers: dict[str, Callable] = {}
        self._round_counts: dict[str, int] = {}

    @classmethod
    def get_instance(cls) -> "AsyncToolRegistry":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def register(self, tool: Tool) -> None:
        """Register a Tool subclass instance."""
        self._tools[tool.name] = tool
        log.info(f"Registered tool: {tool.name}")

    def register_legacy(
        self,
        name: str,
        handler: Callable[..., Any],
        description: str = "",
        per_round_limit: Optional[int] = None,
        param_aliases: Optional[dict[str, str]] = None,
    ) -> None:
        """Register a legacy dict-style tool handler for backward compat.

        Args:
            name: Tool name used in tool_call messages.
            handler: The Python function to call.
            description: Human-readable description.
            per_round_limit: Max calls per tool-use round.
            param_aliases: Map of alias → canonical param name.
                             e.g. {"file_path": "path"} means if the LLM
                             calls with file_path=..., it gets renamed to path=...
                             before being passed to the handler.
        """
        self._legacy_handlers[name] = (
            name, handler, description, per_round_limit, param_aliases or {},
        )
        log.info(f"Registered legacy tool: {name}")

    def get(self, name: str) -> Optional[Tool]:
        return self._tools.get(name)

    def get_legacy_handler(self, name: str) -> Optional[tuple]:
        return self._legacy_handlers.get(name)

    def is_registered(self, name: str) -> bool:
        return name in self._tools or name in self._legacy_handlers

    def list_tools(self) -> list[dict[str, Any]]:
        """Return all tool schemas (new-style + legacy)."""
        schemas = []
        for t in self._tools.values():
            schemas.append({
                "name": t.name,
                "description": t.description,
                "parameters": t.input_schema,
            })
        for name, handler, description, _, _ in self._legacy_handlers.values():
            if name not in self._tools:
                handler_sig = inspect.signature(handler)
                params = {}
                required = []
                for pname, param in handler_sig.parameters.items():
                    if pname in ('username', 'self'):
                        continue
                    params[pname] = {"type": "string"}
                    if param.default is inspect.Parameter.empty:
                        required.append(pname)
                schemas.append({
                    "name": name,
                    "description": getattr(handler, "__doc__", "") or description or name,
                    "parameters": {"type": "object", "properties": params, "required": required},
                })
        return schemas

    def reset_counts(self) -> None:
        """Reset per-round tool call counters."""
        self._round_counts.clear()

    # ------------------------------------------------------------------
    # Async parallel execution
    # ------------------------------------------------------------------

    async def run_tool_async(
        self,
        name: str,
        arguments: dict[str, Any],
        username: str,
        call_id: str,
        timeout: int = 60,
    ) -> ToolExecution:
        """Run a single tool asynchronously.

        Falls back to legacy handler if the tool is not a Tool subclass.
        """
        tool = self._tools.get(name)
        handler_entry = self._legacy_handlers.get(name)
        handler = handler_entry[1] if handler_entry else None
        param_aliases = handler_entry[4] if handler_entry else None

        if not tool and not handler:
            return ToolExecution(
                tool_name=name,
                call_id=call_id,
                arguments=arguments,
                result=ToolResult.err(f"Tool '{name}' not found"),
            )

        # Per-round limit check
        per_round = tool.per_round_limit if tool else None
        if per_round:
            count = self._round_counts.get(name, 0)
            if count >= per_round:
                return ToolExecution(
                    tool_name=name,
                    call_id=call_id,
                    arguments=arguments,
                    result=ToolResult.err(
                        f"Tool '{name}' exceeded per-round limit ({per_round})"
                    ),
                )
            self._round_counts[name] = count + 1

        # Validate input
        if tool:
            errors = tool.validate_input(arguments)
            if errors:
                return ToolExecution(
                    tool_name=name,
                    call_id=call_id,
                    arguments=arguments,
                    result=ToolResult.err(f"Validation errors: {'; '.join(errors)}"),
                )

        try:
            result = await self._execute_async(name, arguments, username, timeout, tool, handler, param_aliases)
            return ToolExecution(tool_name=name, call_id=call_id, arguments=arguments, result=result)
        except Exception as e:
            log.exception(f"Tool {name} failed")
            return ToolExecution(
                tool_name=name,
                call_id=call_id,
                arguments=arguments,
                result=ToolResult.err(f"Tool '{name}' failed: {e}"),
            )

    async def run_parallel_async(
        self,
        tool_calls: list[dict[str, Any]],
        username: str,
        timeout: int = 60,
    ) -> list[ToolExecution]:
        """Run multiple tool calls in parallel when they are independent.

        tool_calls format: [{"id": str, "name": str, "arguments": dict}, ...]
        """
        if not tool_calls:
            return []

        # Separate sequential vs parallel tools
        parallel_calls = []
        sequential_calls = []

        for tc in tool_calls:
            name = tc.get("name") or ""
            if name in SEQUENTIAL_TOOLS:
                sequential_calls.append(tc)
            else:
                parallel_calls.append(tc)

        results: list[ToolExecution] = []

        # Execute parallel tools concurrently
        if parallel_calls:
            tasks = [
                self.run_tool_async(
                    tc.get("name", ""),
                    tc.get("arguments") or tc.get("input") or {},
                    username,
                    tc.get("id", ""),
                    timeout,
                )
                for tc in parallel_calls
            ]
            parallel_results = await asyncio.gather(*tasks, return_exceptions=False)
            results.extend(parallel_results)

        # Execute sequential tools one by one
        for tc in sequential_calls:
            exec_result = await self.run_tool_async(
                tc.get("name", ""),
                tc.get("arguments") or tc.get("input") or {},
                username,
                tc.get("id", ""),
                timeout,
            )
            results.append(exec_result)

        return results

    async def _execute_async(
        self,
        name: str,
        arguments: dict[str, Any],
        username: str,
        timeout: int,
        tool: Optional[Tool],
        handler: Optional[Callable],
        param_aliases: Optional[dict[str, str]] = None,
    ) -> ToolResult:
        """Execute a tool in a thread pool, async-style."""
        def _do_sync() -> ToolResult:
            # Apply param aliases: alias names from LLM → canonical names expected by handler
            args = dict(arguments)
            if param_aliases:
                for alias, canonical in param_aliases.items():
                    if alias in args and canonical not in args:
                        args[canonical] = args.pop(alias)

            username_val = args.get('username') or username
            args['username'] = username_val
            if tool:
                return tool.execute(args, username)
            elif handler:
                sig = inspect.signature(handler)
                filtered = {k: v for k, v in args.items() if k in sig.parameters}
                raw = handler(**filtered)
                return dict_to_result(raw)
            return ToolResult.err(f"No handler for {name}")

        loop = asyncio.get_running_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, _do_sync),
                timeout=timeout,
            )
            return result
        except asyncio.TimeoutError:
            return ToolResult.err(f"Tool '{name}' timed out after {timeout}s")


# ---------------------------------------------------------------------------
# Module-level helpers (mirror the old get_registry / register_tool API)
# ---------------------------------------------------------------------------

# Re-export the backward-compatible @register_tool decorator for skills
def register_tool(
    name: str,
    description: str = "",
    parameters: Optional[dict[str, Any]] = None,
    per_round_limit: Optional[int] = None,
) -> Callable:
    """Backward-compatible decorator for legacy skill tools.

    Translates the old register_tool() API (from the original registry.py)
    into the new registry's format.
    """
    def decorator(func: Callable) -> Callable:
        get_registry().register_legacy(
            name=name,
            handler=func,
            description=description or getattr(func, '__doc__', ''),
            per_round_limit=per_round_limit,
        )
        return func
    return decorator


_legacy_registry = AsyncToolRegistry()


def get_registry() -> AsyncToolRegistry:
    """Get the async tool registry singleton."""
    return _legacy_registry


def register_legacy_tool(
    name: str,
    handler: Callable[..., Any],
    description: str = "",
    per_round_limit: Optional[int] = None,
) -> Callable:
    """Decorator to register a legacy-style tool function."""
    def decorator(func: Callable) -> Callable:
        get_registry().register_legacy(
            name=name,
            handler=func,
            description=description,
            per_round_limit=per_round_limit,
        )
        return func
    return decorator
