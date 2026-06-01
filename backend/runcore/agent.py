"""
Streaming Agent Engine — async pipeline with parallel tool execution.

Refactored from runcore/engine.py with:
  - Type-safe Message/ToolCall dataclasses
  - Typed SSE event system
  - Async parallel tool execution
  - tenacity retry on LLM calls
  - Phase tracking events
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Optional

from tenacity import (
    retry, stop_after_attempt, wait_exponential,
    retry_if_exception_type,
)

from runcore.message import (
    Message, MessageRole, ToolCall as TypedToolCall,
    LLMResponse, dict_to_message, messages_to_dicts, dicts_to_messages,
)
from runcore.sse_events import (
    SSEEvent, SSEEventType, PipelinePhase,
    ThinkingEvent, TextChunkEvent, ToolCallEvent, ToolResultEvent,
    PhaseStartEvent, PhaseEndEvent, PhaseProgressEvent,
    ParallelToolsEvent, DoneEvent, ErrorEvent,
    event_to_sse, legacy_tool_call_to_event, legacy_tool_result_to_event,
)
from runcore.tools.base import ToolResult
from runcore.tools.registry import AsyncToolRegistry, get_registry, ToolExecution
from runcore.tools.file_ops import FileOpsTool
from runcore.tools.search import SearchTool
from runcore.tools.codemap_tool import ScanRepoTool

log = logging.getLogger(__name__)


def _load_memory_context(username: str, query: str = '') -> str:
    """Load relevant context from the two-layer memory system."""
    try:
        import sys
        mod = sys.modules.get('skill_memory_skill') or sys.modules.get('skills.memory_skill')
        if mod and hasattr(mod, 'get_memory_context'):
            result = mod.get_memory_context(
                project='conduit', query=query, username=username
            )
            return result.get('context', '') or ''
        return ''
    except Exception as e:
        log.warning(f'Memory context load failed: {e}')
        return ''


# ---------------------------------------------------------------------------
# Agent Configuration
# ---------------------------------------------------------------------------

@dataclass
class StreamingAgentConfig:
    """Configuration for the streaming agent."""
    username: str
    config: dict[str, Any]
    max_turns: int = 10
    tool_timeout: int = 60
    memory_enabled: bool = True
    pipeline_events: bool = True

    @classmethod
    def from_user_config(cls, username: str, config: dict[str, Any]) -> "StreamingAgentConfig":
        return cls(
            username=username,
            config=config,
            max_turns=int(config.get('max_tool_rounds', 10)),
            tool_timeout=int(config.get('tool_timeout', 60)),
        )


# ---------------------------------------------------------------------------
# StreamingAgentEngine
# ---------------------------------------------------------------------------

class StreamingAgentEngine:
    """Async streaming agent engine with parallel tool execution.

    Key improvements over the original AgentEngine:
    - Async/await throughout
    - Parallel tool execution via asyncio.gather
    - Type-safe messages and events
    - tenacity retry on LLM calls
    - Phase pipeline events for frontend progress tracking
    """

    def __init__(self, username: str, config: Optional[dict[str, Any]] = None):
        from core.config import load_user_config
        self.username = username
        self.config = config or load_user_config(username)
        self.cfg = StreamingAgentConfig.from_user_config(username, self.config)
        self._provider = self._build_provider()
        self.registry = get_registry()
        self._message_history: list[Message] = []
        self._system_prompt = ""
        self._start_time: float = 0

        # Register new unified tools if not already registered
        self._register_tools()

    def _register_tools(self) -> None:
        """Ensure new tools are registered (idempotent)."""
        if not self.registry.get("file_ops"):
            self.registry.register(FileOpsTool())
            log.info("Registered FileOpsTool")
        if not self.registry.get("search"):
            self.registry.register(SearchTool())
            log.info("Registered SearchTool")
        if not self.registry.get("scan_repo"):
            self.registry.register(ScanRepoTool())
            log.info("Registered ScanRepoTool")

    def _build_provider(self):
        from runcore.llm import create_provider
        from runcore.llm.base import LLMProvider

        provider_type = self.config.get('provider', 'minimax')
        api_key = self._get_provider_api_key(provider_type)
        model = self._get_provider_model(provider_type)
        base_url = self._get_provider_base_url(provider_type)
        log.info(f'_build_provider: provider={provider_type}, model={model}')

        if not api_key:
            raise ValueError(f'No API key configured for provider={provider_type}')

        return create_provider(provider_type, api_key, model, base_url=base_url or None)

    def _get_provider_api_key(self, provider: str) -> str:
        if provider in ('minimax', 'MiniMax'):
            return self.config.get('minimax_api_key', '') or self.config.get('api_key', '')
        elif provider in ('deepseek', 'DeepSeek'):
            return self.config.get('deepseek_api_key', '') or self.config.get('api_key', '')
        elif provider in ('anthropic', 'claude'):
            return self.config.get('anthropic_api_key', '') or self.config.get('api_key', '')
        elif provider in ('openai', 'OpenAI'):
            return self.config.get('api_key', '')
        return self.config.get('api_key', '')

    def _get_provider_model(self, provider: str) -> str:
        if provider in ('minimax', 'MiniMax'):
            return self.config.get('minimax_model', '') or 'MiniMax-Text-01'
        elif provider in ('deepseek', 'DeepSeek'):
            return self.config.get('deepseek_model', '') or self.config.get('model', 'deepseek-chat')
        elif provider in ('anthropic', 'claude'):
            return self.config.get('anthropic_model', '') or 'claude-sonnet-4-20250514'
        elif provider in ('openai', 'OpenAI'):
            return self.config.get('model', 'gpt-4o')
        return self.config.get('model', 'gpt-4o')

    def _get_provider_base_url(self, provider: str) -> str | None:
        if provider in ('minimax', 'MiniMax'):
            return self.config.get('minimax_base_url') or 'https://api.minimax.chat/v1'
        elif provider in ('deepseek', 'DeepSeek'):
            return self.config.get('deepseek_base_url') or 'https://api.deepseek.com'
        elif provider in ('anthropic', 'claude'):
            return None
        elif provider in ('openai', 'OpenAI'):
            return self.config.get('base_url')
        return self.config.get('base_url')

    def _get_repos_path(self) -> str:
        """Return the absolute path to the user's repos directory."""
        workspace = self.config.get('workspace_root', '')
        if workspace:
            return f"{workspace}\\hermes\\data\\users\\{self.username}\\repos"
        import os as _os
        return _os.path.join(
            _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))),
            'data', 'users', self.username, 'repos'
        )

    def _build_system_prompt(self, memory_context: str = '') -> str:
        base = self.config.get('soul', '')
        tools = self.registry.list_tools()
        tools_desc = '\n'.join(
            f"- **{t['name']}**: {t['description'][:150]}"
            for t in tools
        )

        workspace_root = self.config.get('workspace_root', '')
        repos_path = self._get_repos_path()

        memory_section = ''
        if memory_context:
            memory_section = f'\n\n## Historical Context\n{memory_context}'

        return f"""{base}{memory_section}

## Your Environment
- workspace_root: {workspace_root}
- user repos location: {repos_path}
- ALL repositories are cloned under: {repos_path}
- Active repository to work on: check `git status` via bash or `file_ops` (operation: list_dir)

## Built-in Tools
{tools_desc}

## Critical Path Rules
1. **START HERE**: Use `scan_repo` FIRST to understand the project structure.
   Pass `repo_path` as an absolute path and a `query` describing the feature.
2. **Read existing code** BEFORE writing anything. Use `file_ops` (operation: read_file).
3. **Write changes** with `file_ops` (operation: write_file).
4. **Verify**: Run `bash` with `npm run test` (or appropriate test command for the project).
5. **Commit & push**: Use `bash` with git commands when tests pass.
6. **Done**: When all changes are written and tests pass, respond with a plain text summary. DO NOT keep searching after work is done.

## Marketplace Skills
You have access to 18 specialized skills loaded from the marketplace. Read their SKILL.md
instructions to guide your approach for complex tasks:
- **feature-planning**: Break feature requests into detailed plans
- **code-auditor**: Comprehensive code quality and security analysis
- **codebase-documenter**: Generate project documentation
- **code-refactor**: Bulk identifier renaming and pattern replacement
- **test-fixing**: Systematically fix failing tests
- **git-pushing**: Stage, commit, and push with conventional messages
- **project-bootstrapper**: Set up new projects with best practices
- **code-transfer**: Precise line-based code copying between files
- **file-operations**: Detailed file analysis and statistics
- **review-implementing**: Process code review feedback with todo tracking
- **architecture-diagram-creator**: HTML architecture diagrams
- **dashboard-creator**: KPI dashboards and data visualizations
- **timeline-creator**: Project roadmaps and Gantt charts
- **flowchart-creator**: Process diagrams and decision trees
- **technical-doc-creator**: API reference documentation
- **code-execution**: Bulk Python operations for 10+ files
- **ensemble-solving**: Generate multiple solutions and pick the best
- **conversation-analyzer**: Analyze Claude Code usage patterns

## Common Pitfalls (Avoid These)
- Do NOT re-read files you've already read. Once you understand the code, write the changes.
- If a tool fails with a path error, check the actual absolute path returned and use it directly.
- Do NOT loop: if you modified a file, move on to the next step. Stop when work is done.

Be concise and use tools when needed."""

    def _build_tools_schema(self) -> list[dict]:
        """Return tools in OpenAI function-calling format.

        Normalizes both new-style (with 'function' key) and legacy
        skill schemas (flat {name, description, parameters}) to the
        canonical OpenAI format.
        """
        tools = self.registry.list_tools()
        result = []
        for t in tools:
            if 'function' in t:
                # Already OpenAI format
                result.append(t)
            else:
                # Legacy skill format: {name, description, parameters}
                result.append({
                    'type': 'function',
                    'function': {
                        'name': t['name'],
                        'description': t.get('description') or t.get('description', ''),
                        'parameters': t.get('parameters') or {'type': 'object', 'properties': {}},
                    },
                })
        return result

    # ------------------------------------------------------------------
    # Public streaming API
    # ------------------------------------------------------------------

    async def chat_stream(
        self,
        user_message: str,
        conversation_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream SSE events for a chat response.

        This is the main entry point used by the /api/chat endpoint.
        Yields SSE-formatted event strings.
        """
        self._start_time = time.time()
        self.registry.reset_counts()
        self._message_history.clear()

        # Build system prompt with memory context
        memory_ctx = ""
        if self.cfg.memory_enabled:
            memory_ctx = _load_memory_context(self.username, user_message)
        self._system_prompt = self._build_system_prompt(memory_ctx)

        turn = 0
        changed_files: list[str] = []

        while turn < self.cfg.max_turns:
            turn += 1
            log.info(f'=== Turn {turn} ===')

            # Emit phase
            yield event_to_sse(PhaseStartEvent(
                phase=PipelinePhase.CODE,
                description=f"Turn {turn}/{self.cfg.max_turns}",
            ))

            # Build messages for LLM
            messages_dicts = [
                {"role": "system", "content": self._system_prompt},
            ] + [m.to_dict() for m in self._message_history] + [
                {"role": "user", "content": user_message}
            ]

            # LLM call with retry
            response = await self._llm_with_retry(messages_dicts)

            # Emit thinking if present
            if response.thinking:
                yield event_to_sse(ThinkingEvent(data=response.thinking))

            # Extract text content
            text_parts: list[str] = []
            if response.content:
                text_parts.append(response.content)
                for chunk in response.content:
                    yield event_to_sse(TextChunkEvent(data=chunk))
                self._message_history.append(
                    Message.assistant(content=response.content)
                )

            # Extract tool calls
            tool_calls = response.tool_calls or []
            log.info(f'LLM returned {len(tool_calls)} tool calls: {[tc.name for tc in tool_calls]}')

            if not tool_calls:
                # No tools — we're done
                if changed_files:
                    self._auto_save_memory(changed_files, user_message)
                yield event_to_sse(DoneEvent())
                return

            # Emit phase progress
            yield event_to_sse(PhaseProgressEvent(
                phase=PipelinePhase.CODE,
                progress=turn / self.cfg.max_turns,
                description=f"Executing {len(tool_calls)} tool(s)",
            ))

            # Parallel tool execution
            tc_dicts = [tc.to_dict() for tc in tool_calls]
            yield event_to_sse(ParallelToolsEvent(
                tool_names=[tc.name for tc in tool_calls],
                call_ids=[tc.id for tc in tool_calls],
            ))

            results = await self.registry.run_parallel_async(
                [{"id": tc.id, "name": tc.name, "arguments": tc.arguments} for tc in tool_calls],
                username=self.username,
                timeout=self.cfg.tool_timeout,
            )

            # Sort results to match tool_call order
            result_map = {r.call_id: r for r in results}

            for tc in tool_calls:
                exec_result = result_map.get(tc.id)
                if exec_result is None:
                    exec_result = ToolExecution(tool_name=tc.name, call_id=tc.id,
                                               arguments=tc.arguments,
                                               result=ToolResult.err("No result"))

                # Emit tool events
                yield event_to_sse(ToolCallEvent(
                    call_id=tc.id,
                    name=tc.name,
                    input=tc.arguments,
                ))

                yield event_to_sse(ToolResultEvent(
                    call_id=tc.id,
                    result=exec_result.result.content,
                    error=exec_result.result.error if not exec_result.result.success else None,
                    metadata=exec_result.result.metadata,
                ))

                # Track changed files
                if tc.name == "write_file" and exec_result.result.success:
                    path = tc.arguments.get("path", "")
                    if path and path not in changed_files:
                        changed_files.append(path)

                # Add to history
                self._message_history.append(Message.assistant(
                    content=None,
                    tool_calls=[tc],
                ))
                self._message_history.append(Message.tool(
                    content=exec_result.result.content,
                    tool_call_id=tc.id,
                    name=tc.name,
                ))

            # After tools run, emit a reasoning step so user sees the thought process
            reasoning_prompt = (
                "You just ran tool(s) and received results above. "
                "Briefly explain what the results mean and what you should do next. "
                "Be concise (1-3 sentences)."
            )
            reasoning_msgs = [m.to_dict() for m in self._message_history] + [
                {"role": "user", "content": reasoning_prompt}
            ]
            try:
                reasoning_response = await self._llm_with_retry(reasoning_msgs)
                if reasoning_response.content:
                    yield event_to_sse(ThinkingEvent(data=reasoning_response.content))
                    self._message_history.append(
                        Message.assistant(content=reasoning_response.content)
                    )
                elif reasoning_response.thinking:
                    yield event_to_sse(ThinkingEvent(data=reasoning_response.thinking))
                    self._message_history.append(
                        Message.assistant(content=reasoning_response.thinking)
                    )
            except Exception:
                pass  # Don't block on reasoning failure

            yield event_to_sse(PhaseEndEvent(
                phase=PipelinePhase.CODE,
                success=True,
                description=f"Turn {turn} complete",
            ))

        # Max turns reached
        if changed_files:
            self._auto_save_memory(changed_files, user_message)
        yield event_to_sse(ErrorEvent(data='Max iterations reached'))

    # ------------------------------------------------------------------
    # LLM with retry (tenacity)
    # ------------------------------------------------------------------

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
        reraise=True,
    )
    async def _llm_with_retry(self, messages: list[dict[str, Any]]) -> LLMResponse:
        """Call LLM with exponential-backoff retry."""
        return await self._llm_call(messages)

    async def _llm_call(self, messages: list[dict[str, Any]]) -> LLMResponse:
        """Call the LLM provider and extract tool calls."""
        tools = self._build_tools_schema()
        accumulated_text = ""
        accumulated_thinking = ""
        tool_calls: list[TypedToolCall] = []
        finish_reason = None

        # Use stream to accumulate, then return complete response
        try:
            async for event_str in self._provider.chat(messages, tools, stream=True):
                if not event_str.strip():
                    continue

                try:
                    event = json.loads(event_str)
                except json.JSONDecodeError:
                    continue

                ev_type = event.get("event", "")
                ev_data = event.get("data", "")

                if ev_type == "thinking":
                    accumulated_thinking += ev_data

                elif ev_type in ("text_chunk", "text_delta"):
                    accumulated_text += ev_data

                elif ev_type == "tool_call":
                    tool_calls.append(TypedToolCall(
                        id=event.get("call_id", ""),
                        name=event.get("name", ""),
                        arguments=event.get("input") or {},
                    ))

                elif ev_type == "done":
                    finish_reason = "stop"

                elif ev_type == "error":
                    log.error(f"LLM error: {ev_data}")

        except Exception as e:
            log.exception("LLM call failed")
            raise

        return LLMResponse(
            content=accumulated_text or None,
            thinking=accumulated_thinking or None,
            tool_calls=tool_calls if tool_calls else None,
            finish_reason=finish_reason,
        )

    # ------------------------------------------------------------------
    # Backward-compat: add/get/clear history
    # ------------------------------------------------------------------

    def add_to_history(self, role: str, content: str) -> None:
        """Legacy compat: add a dict-style message."""
        try:
            role_enum = MessageRole(role)
        except ValueError:
            role_enum = MessageRole.USER
        self._message_history.append(Message(role=role_enum, content=content))

    def clear_history(self) -> None:
        self._message_history.clear()

    def get_history(self) -> list[dict[str, str]]:
        return [m.to_dict() for m in self._message_history]

    # ------------------------------------------------------------------
    # Memory
    # ------------------------------------------------------------------

    def _auto_save_memory(self, changed_files: list[str], user_request: str) -> None:
        try:
            import sys
            mod = sys.modules.get('skill_memory_skill') or sys.modules.get('skills.memory_skill')
            if mod and hasattr(mod, 'memory_save'):
                repo_name = self._infer_repo_name(changed_files)
                content = (
                    f"Changed {len(changed_files)} file(s) in {repo_name}: "
                    f"{', '.join(changed_files[:5])}"
                    + (f" (+{len(changed_files) - 5} more)" if len(changed_files) > 5 else "")
                    + f"\n\nUser request: {user_request[:200]}"
                )
                mod.memory_save(
                    content=content, category='temporary',
                    project=repo_name or 'conduit',
                    tags='auto-save,change', username=self.username,
                )
                log.info(f'Auto-saved memory for {len(changed_files)} files')
        except Exception as e:
            log.warning(f'Auto-save memory failed: {e}')

    def _infer_repo_name(self, changed_files: list[str]) -> str:
        import os
        for f in changed_files:
            parts = f.split(os.sep)
            for i, p in enumerate(parts):
                if p == 'repos' and i + 1 < len(parts):
                    return parts[i + 1]
        return 'conduit'
