from __future__ import annotations

"""AgentEngine — the core conversation engine with multi-provider LLM support."""
import json
import logging
import os
from typing import Any, AsyncGenerator, Optional

from runcore.llm import create_provider
from runcore.tools.registry import get_registry
from runcore.context import get_username, get_user_config

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
            return result.get('context', '')
        return ''
    except Exception as e:
        log.warning(f'Memory context load failed: {e}')
        return ''


class AgentEngine:
    """Unified agent engine for Hermes."""

    def __init__(self, username: str, config: Optional[dict] = None):
        from core.config import load_user_config
        self.username = username
        self.config = config or load_user_config(username)
        self.provider = self._build_provider()
        self.registry = get_registry()
        self._message_history: list[dict[str, str]] = []
        self._system_prompt = self._build_system_prompt()

    def _build_provider(self):
        from core.config import load_user_config
        self.config = self.config or load_user_config(self.username)
        provider_type = self.config.get('provider', 'minimax')
        api_key = self._get_provider_api_key(provider_type)
        model = self._get_provider_model(provider_type)
        base_url = self._get_provider_base_url(provider_type)
        log.info(f'_build_provider: provider={provider_type}, model={model}, base_url={base_url}')
        if not api_key:
            raise ValueError(f'No API key configured for provider={provider_type} for user {self.username}')
        return create_provider(provider_type, api_key, model, base_url=base_url)

    def _get_provider_api_key(self, provider: str) -> str:
        if provider == 'minimax':
            return self.config.get('minimax_api_key', '') or self.config.get('api_key', '')
        elif provider == 'deepseek':
            return self.config.get('deepseek_api_key', '') or self.config.get('api_key', '')
        elif provider == 'anthropic':
            return self.config.get('anthropic_api_key', '') or self.config.get('api_key', '')
        else:
            return self.config.get('api_key', '')

    def _get_provider_model(self, provider: str) -> str:
        if provider == 'minimax':
            return self.config.get('minimax_model', '') or 'MiniMax-Text-01'
        elif provider == 'deepseek':
            return self.config.get('deepseek_model', '') or 'deepseek-chat'
        elif provider == 'anthropic':
            return self.config.get('anthropic_model', '') or 'claude-sonnet-4-20250514'
        else:
            return self.config.get('model', 'gpt-4o')

    def _get_provider_base_url(self, provider: str) -> str | None:
        if provider == 'minimax':
            return self.config.get('minimax_base_url') or 'https://api.minimax.chat/v1'
        elif provider == 'deepseek':
            return self.config.get('deepseek_base_url') or 'https://api.deepseek.com'
        elif provider == 'anthropic':
            return None
        else:
            return self.config.get('base_url')

    def _build_system_prompt(self, memory_context: str = '') -> str:
        base = self.config.get('soul', '')
        tools = self.registry.list_tools()
        tools_desc = '\n'.join(
            f"- **{t['name']}**: {t['description']}" for t in tools
        )
        memory_section = ''
        if memory_context:
            memory_section = f'\n\n## Historical Context\n{memory_context}'
        return f"""{base}{memory_section}

You are working in a real codebase. Workflow:
1. FIRST: use git_clone if the project is not yet cloned
2. Use list_dir/read_file to explore the codebase
3. Use write_file to make changes
4. After changes: use lint_and_test to verify
5. When tests pass: use git_commit_and_pr to submit
6. After changes complete: use memory_save to record what was done

You have access to the following tools:
{tools_desc}

Be concise and use tools when needed."""

    def _build_tools_schema(self) -> list[dict]:
        return [
            {
                'type': 'function',
                'function': {
                    'name': t['name'],
                    'description': t['description'],
                    'parameters': t['parameters']
                }
            }
            for t in self.registry.list_tools()
        ]

    async def chat_stream(
        self,
        user_message: str,
        conversation_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream chat response as SSE-compatible JSON strings.

        Agent loop:
        - Tool call rounds: use chat_sync() (synchronous, reliable tool extraction)
        - Final round: use chat() (streaming for UX)

        Auto-memory: after successful write_file operations, extract and save
        a summary to the temporary memory layer.
        """
        memory_context = _load_memory_context(self.username, user_message)

        system_msg = {
            'role': 'system',
            'content': self._build_system_prompt(memory_context)
        }

        tools_schema = self._build_tools_schema()
        self.registry.reset_counts()
        max_turns = int(self.config.get('max_tool_rounds', 10))
        turn = 0

        changed_files: list[str] = []

        while turn < max_turns:
            turn += 1
            messages = [system_msg] + self._message_history + [{'role': 'user', 'content': user_message}]

            result = self.provider.chat_sync(messages, tools_schema)
            log.info(f'chat_sync round {turn}: content_len={len(result.content or "")}, tool_calls={len(result.tool_calls)}')

            if result.reasoning:
                yield json.dumps({'event': 'thinking', 'data': result.reasoning}) + '\n'

            if result.content:
                for i, chunk in enumerate(result.content):
                    yield json.dumps({'event': 'text_chunk', 'data': chunk}) + '\n'
                self._message_history.append({'role': 'assistant', 'content': result.content})

            if not result.tool_calls:
                if changed_files:
                    self._auto_save_memory(changed_files, user_message)
                yield json.dumps({'event': 'done'}) + '\n'
                return

            for tc in result.tool_calls:
                tc_id = tc.get('id') or f'tc_{turn}'
                func = tc.get('function') or {}
                name = func.get('name', '')
                args_str = func.get('arguments', '{}')
                try:
                    args_obj = json.loads(args_str) if isinstance(args_str, str) else args_str
                except json.JSONDecodeError:
                    args_obj = {}

                yield json.dumps({
                    'event': 'tool_call',
                    'call_id': tc_id,
                    'name': name,
                    'input': args_obj
                }) + '\n'

                result_str, error = self.registry.run_tool(name, args_obj, self.username)

                if name == 'write_file' and not error:
                    try:
                        path = args_obj.get('path', '')
                        if path:
                            changed_files.append(path)
                    except Exception:
                        pass

                yield json.dumps({
                    'event': 'tool_result',
                    'call_id': tc_id,
                    'result': result_str,
                    'error': error
                }) + '\n'

                self._message_history.append({
                    'role': 'assistant',
                    'content': None,
                    'tool_calls': [{
                        'id': tc_id,
                        'type': 'function',
                        'function': {'name': name, 'arguments': args_str}
                    }]
                })
                self._message_history.append({
                    'role': 'tool',
                    'content': result_str,
                    'tool_call_id': tc_id
                })

        if changed_files:
            self._auto_save_memory(changed_files, user_message)
        yield json.dumps({'event': 'error', 'data': 'Max iterations reached'}) + '\n'

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
                    content=content,
                    category='temporary',
                    project=repo_name or 'conduit',
                    tags='auto-save,change',
                    username=self.username
                )
                log.info(f'Auto-saved memory for {len(changed_files)} files')
        except Exception as e:
            log.warning(f'Auto-save memory failed: {e}')

    def _infer_repo_name(self, changed_files: list[str]) -> str:
        for f in changed_files:
            parts = f.split(os.sep)
            for i, p in enumerate(parts):
                if p == 'repos' and i + 1 < len(parts):
                    return parts[i + 1]
        return 'conduit'

    def add_to_history(self, role: str, content: str) -> None:
        self._message_history.append({'role': role, 'content': content})

    def clear_history(self) -> None:
        self._message_history.clear()

    def get_history(self) -> list[dict[str, str]]:
        return self._message_history.copy()
