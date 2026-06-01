from __future__ import annotations

"""Anthropic Claude LLM provider."""
import json
from typing import Any, AsyncGenerator, Optional
import httpx
from runcore.llm.base import LLMProvider, ToolCall, LLMResponse


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, **kwargs):
        super().__init__(api_key, model, **kwargs)
        self.base_url = 'https://api.anthropic.com/v1'
        self.api_version = '2023-06-01'

    async def chat(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict]] = None,
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        # Convert OpenAI format to Anthropic format
        sys_msg = ''
        anthropic_msgs = []
        for m in messages:
            if m['role'] == 'system':
                sys_msg = m['content']
            else:
                anthropic_msgs.append({
                    'role': m['role'],
                    'content': m['content']
                })

        headers = {
            'x-api-key': self.api_key,
            'anthropic-version': self.api_version,
            'content-type': 'application/json',
        }
        payload: dict[str, Any] = {
            'model': self.model,
            'messages': anthropic_msgs,
            'stream': stream,
            'max_tokens': 4096,
        }
        if sys_msg:
            payload['system'] = sys_msg
        if tools:
            payload['tools'] = tools

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            async with client.stream(
                'POST',
                f'{self.base_url}/messages',
                headers=headers,
                json=payload
            ) as r:
                tool_calls_buf: dict[int, dict] = {}
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    if line.startswith('event:'):
                        event_type = line[6:].strip()
                        continue
                    if line.startswith('data:'):
                        data_str = line[5:].strip()
                        if data_str == '[DONE]':
                            break
                        data = json.loads(data_str)

                        if data.get('type') == 'content_block_delta':
                            delta = data.get('delta', {})
                            if delta.get('type') == 'text_delta':
                                yield json.dumps({
                                    'event': 'text_chunk',
                                    'data': delta.get('text', '')
                                }) + '\n'
                            elif delta.get('type') == 'thinking_delta':
                                yield json.dumps({
                                    'event': 'thinking',
                                    'data': delta.get('thinking', '')
                                }) + '\n'
                            elif delta.get('type') == 'input_json_delta':
                                idx = int(data.get('index', 0))
                                if idx not in tool_calls_buf:
                                    tool_calls_buf[idx] = {'name': '', 'args': ''}
                                tool_calls_buf[idx]['args'] += delta.get('partial_json', '')

                        elif data.get('type') == 'content_block_start':
                            block = data.get('content_block', {})
                            if block.get('type') == 'tool_use':
                                idx = int(data.get('index', 0))
                                tool_calls_buf[idx] = {
                                    'id': block.get('id', ''),
                                    'name': block.get('name', ''),
                                    'args': ''
                                }

                        elif data.get('type') == 'message_delta':
                            yield json.dumps({'event': 'done'}) + '\n'

                for idx in sorted(tool_calls_buf.keys()):
                    tc = tool_calls_buf[idx]
                    if tc.get('name'):
                        try:
                            args = json.loads(tc['args']) if tc['args'] else {}
                        except json.JSONDecodeError:
                            args = {'_raw': tc['args']}
                        yield json.dumps({
                            'event': 'tool_call',
                            'call_id': tc.get('id', f'call_{idx}'),
                            'name': tc['name'],
                            'input': args
                        }) + '\n'

    async def chat_complete(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict]] = None,
    ) -> LLMResponse:
        sys_msg = ''
        anthropic_msgs = []
        for m in messages:
            if m['role'] == 'system':
                sys_msg = m['content']
            else:
                anthropic_msgs.append({'role': m['role'], 'content': m['content']})

        headers = {
            'x-api-key': self.api_key,
            'anthropic-version': self.api_version,
            'content-type': 'application/json',
        }
        payload: dict[str, Any] = {
            'model': self.model,
            'messages': anthropic_msgs,
            'max_tokens': 4096,
        }
        if sys_msg:
            payload['system'] = sys_msg
        if tools:
            payload['tools'] = tools

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            r = await client.post(f'{self.base_url}/messages', headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()

            content_parts = []
            tool_calls = []
            for block in data.get('content', []):
                if block.get('type') == 'text':
                    content_parts.append(block.get('text', ''))
                elif block.get('type') == 'tool_use':
                    tool_calls.append(ToolCall(
                        id=block.get('id', ''),
                        name=block.get('name', ''),
                        arguments=block.get('input', {})
                    ))

            return LLMResponse(
                content='\n'.join(content_parts),
                tool_calls=tool_calls,
                usage=data.get('usage'),
                finish_reason=data.get('stop_reason')
            )
