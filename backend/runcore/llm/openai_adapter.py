from __future__ import annotations

"""OpenAI / DeepSeek / MiniMax LLM provider via LangChain.

Includes monkey-patches for reasoning_content support on DeepSeek/MiniMax-style
extended thinking responses (reasoning_content in response chunks / deltas).
"""
import json
import logging
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Optional

from langchain_openai import ChatOpenAI
from langchain_openai.chat_models import base as _lco_base
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage, AIMessageChunk
from runcore.llm.base import LLMProvider, LLMResponse, ToolCall

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Monkey-patch langchain-openai to capture reasoning_content from DeepSeek/MiniMax
# ---------------------------------------------------------------------------
_orig_cd = _lco_base._convert_delta_to_message_chunk


def _convert_delta_with_reasoning(_dict, default_class):
    chunk = _orig_cd(_dict, default_class)
    rc = _dict.get("reasoning_content")
    if rc is not None and isinstance(chunk, AIMessageChunk):
        chunk.additional_kwargs["reasoning_content"] = rc
    return chunk


_lco_base._convert_delta_to_message_chunk = _convert_delta_with_reasoning

_orig_cmd = _lco_base._convert_dict_to_message


def _convert_dict_with_reasoning(_dict):
    msg = _orig_cmd(_dict)
    rc = _dict.get("reasoning_content")
    if rc is not None and isinstance(msg, AIMessage):
        msg.additional_kwargs["reasoning_content"] = rc
    return msg


_lco_base._convert_dict_to_message = _convert_dict_with_reasoning

_orig_cmtd = _lco_base._convert_message_to_dict


def _convert_msg_to_dict_with_reasoning(message):
    result = _orig_cmtd(message)
    rc = message.additional_kwargs.get("reasoning_content")
    if rc is not None and isinstance(message, AIMessage):
        result["reasoning_content"] = rc
        if result.get("content") is None:
            result["content"] = ""
    return result


_lco_base._convert_message_to_dict = _convert_msg_to_dict_with_reasoning


def _build_llm(provider_type: str, config: dict):
    """Build ChatOpenAI (or compatible) for OpenAI/DeepSeek/MiniMax."""
    from langchain_openai import ChatOpenAI
    api_key = config['api_key']
    model = config.get('model')
    base_url = config.get('base_url')
    temperature = float(config.get('temperature', 0.7))
    max_tokens = int(config.get('max_tokens', 4096)) or None

    _provider_defaults = {
        'openai': 'https://api.openai.com/v1',
        'deepseek': 'https://api.deepseek.com',
        'minimax': 'https://api.minimax.chat/v1',
    }
    default_url = _provider_defaults.get(provider_type, 'https://api.openai.com/v1')

    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url or default_url,
        streaming=True,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _messages_to_langchain(messages: list[dict[str, str]]):
    """Convert plain message dicts to LangChain messages.

    Handles two tool_calls formats:
    - OpenAI style: {id, function:{name, arguments}}  (from engine)
    - LangChain style: {id, name, args}             (internal)
    """
    lc = []
    for m in messages:
        role = m.get('role', 'user')
        content = m.get('content', '')
        tool_call_id = m.get('tool_call_id', '')
        raw_tool_calls = m.get('tool_calls', [])

        # Normalize tool_calls to LangChain format
        tool_calls_lc = None
        if raw_tool_calls:
            tool_calls_lc = []
            for tc in raw_tool_calls:
                if isinstance(tc, dict):
                    func = tc.get('function') or {}
                    name = tc.get('name') or func.get('name', '')
                    args_raw = tc.get('args') or tc.get('arguments') or func.get('arguments') or {}
                    args = args_raw if isinstance(args_raw, dict) else {}
                    tool_calls_lc.append({
                        'name': name,
                        'args': args,
                        'id': tc.get('id', ''),
                        'type': 'tool_call',
                    })

        if role == 'system':
            lc.append(SystemMessage(content=content))
        elif role == 'user':
            lc.append(HumanMessage(content=content))
        elif role == 'assistant':
            if tool_calls_lc:
                lc.append(AIMessage(content=content or '', tool_calls=tool_calls_lc))
            else:
                lc.append(AIMessage(content=content or ''))
        elif role == 'tool':
            lc.append(ToolMessage(content=content, tool_call_id=tool_call_id))
    return lc


def _extract_tool_calls(output: Any) -> list[dict[str, Any]]:
    """Extract tool calls from a LangChain AIMessage output.

    Handles both LangChain standard (AIMessage.tool_calls) and
    OpenAI raw (additional_kwargs['tool_calls']).
    """
    if output is None:
        return []

    raw = getattr(output, 'tool_calls', None)
    if raw and isinstance(raw, list):
        out = []
        for tc in raw:
            if isinstance(tc, dict):
                name = tc.get('name') or ''
                tid = tc.get('id') or ''
                args = tc.get('args') or tc.get('arguments') or {}
                if isinstance(args, str):
                    args_str = args
                else:
                    args_str = json.dumps(args, ensure_ascii=False) if args else '{}'
                out.append({
                    'id': tid,
                    'function': {'name': name, 'arguments': args_str},
                })
        return out

    ak = getattr(output, 'additional_kwargs', None) or {}
    tc_list = ak.get('tool_calls') or []
    if isinstance(tc_list, list):
        return tc_list
    return []


def _parse_tool_args(args_str: str) -> dict[str, Any]:
    """Parse tool call arguments from a JSON string."""
    if isinstance(args_str, dict):
        return args_str
    try:
        return json.loads(args_str)
    except (json.JSONDecodeError, TypeError):
        return {}


@dataclass
class ChatResult:
    """Synchronous result from a chat call, including tool calls."""
    content: str
    tool_calls: list[dict[str, Any]]
    reasoning: Optional[str] = None


class OpenAIProvider(LLMProvider):
    """OpenAI / DeepSeek / MiniMax provider via LangChain.

    Tool calls are extracted at on_chat_model_end (never during stream).
    Supports reasoning_content via langchain monkey-patches (DeepSeek/MiniMax).
    """

    def __init__(
        self,
        api_key: str,
        model: str,
        provider: str = 'openai',
        base_url: Optional[str] = None,
        **kwargs
    ):
        super().__init__(api_key, model, **kwargs)
        self.provider_name = provider
        self._base_url = base_url

    def _llm_config(self) -> dict:
        cfg = {
            'api_key': self.api_key,
            'model': self.model,
            'temperature': self.kwargs.get('temperature'),
            'max_tokens': self.kwargs.get('max_tokens'),
        }
        if self._base_url:
            cfg['base_url'] = self._base_url
        return {k: v for k, v in cfg.items() if v is not None}

    def _build_llm_instance(self, tools: Optional[list[dict]] = None):
        config = self._llm_config()
        llm = _build_llm(self.provider_name, config)
        if tools:
            lc_tools = [
                {
                    'type': 'function',
                    'function': {
                        'name': t['function']['name'],
                        'description': t['function']['description'],
                        'parameters': t['function']['parameters']
                    }
                }
                for t in tools
            ]
            log.info(f'Binding {len(lc_tools)} tools: {[t["function"]["name"] for t in lc_tools]}')
            return llm.bind(tools=lc_tools, tool_choice='auto')
        return llm

    async def chat(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict]] = None,
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Stream response, then return tool calls via get_last_tool_calls()."""
        lc_messages = _messages_to_langchain(messages)
        llm = self._build_llm_instance(tools)
        self._last_tool_calls = []
        accumulated_text = ''

        try:
            async for event in llm.astream_events(lc_messages, version='v2'):
                event_type = event.get('event')

                if event_type == 'on_chat_model_stream':
                    chunk = event['data']['chunk'].content

                    if isinstance(chunk, list):
                        for item in chunk:
                            if item.type == 'text':
                                text = getattr(item, 'text', '') or ''
                                if text:
                                    accumulated_text += text
                                    yield json.dumps({
                                        'event': 'text_chunk',
                                        'data': text
                                    }) + '\n'
                            elif item.type == 'tool_use':
                                pass  # ignore during stream

                    elif isinstance(chunk, str) and chunk:
                        accumulated_text += chunk
                        yield json.dumps({'event': 'text_chunk', 'data': chunk}) + '\n'

                elif event_type == 'on_chat_model_end':
                    output = event['data']['output']
                    tc_list = _extract_tool_calls(output)
                    self._last_tool_calls = tc_list

                    # Yield each tool call as an SSE event so the agent can collect them
                    for tc in tc_list:
                        func = tc.get('function') or {}
                        yield json.dumps({
                            'event': 'tool_call',
                            'call_id': tc.get('id', ''),
                            'name': func.get('name', ''),
                            'input': _parse_tool_args(func.get('arguments', '{}')),
                        }) + '\n'

                    reasoning = getattr(output, 'additional_kwargs', {}).get('thinking') or \
                                getattr(output, 'reasoning', None)
                    if reasoning:
                        yield json.dumps({
                            'event': 'thinking',
                            'data': str(reasoning)
                        }) + '\n'

                    log.info(f'on_chat_model_end: stored {len(tc_list)} tool calls, accumulated_text len={len(accumulated_text)}')

                elif event_type == 'on_chat_model_start':
                    pass

        except Exception as e:
            log.exception('LLM provider error')
            yield json.dumps({'event': 'error', 'data': f'LLM error: {str(e)}'}) + '\n'
            yield json.dumps({'event': 'done'}) + '\n'

        yield json.dumps({'event': 'done'}) + '\n'

    def chat_sync(self, messages: list[dict[str, str]], tools: Optional[list[dict]] = None) -> ChatResult:
        """Synchronous chat — runs LLM in thread pool to avoid blocking the async event loop."""
        lc_messages = _messages_to_langchain(messages)
        llm = self._build_llm_instance(tools)

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            try:
                fut = pool.submit(llm.invoke, lc_messages)
                response = fut.result(timeout=120)
            except concurrent.futures.TimeoutError:
                raise TimeoutError('LLM call timed out after 120s')

        content = response.content if hasattr(response, 'content') else str(response)
        tc_list = _extract_tool_calls(response)
        reasoning = getattr(response, 'additional_kwargs', {}).get('thinking') or \
                    getattr(response, 'reasoning', None)

        return ChatResult(content=content, tool_calls=tc_list, reasoning=reasoning)

    def get_last_tool_calls(self) -> list[dict[str, Any]]:
        """Return tool calls extracted from the last chat() call."""
        log.info(f'get_last_tool_calls called, returning: {self._last_tool_calls}')
        return self._last_tool_calls

    async def chat_complete(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict]] = None,
    ) -> LLMResponse:
        lc_messages = _messages_to_langchain(messages)
        llm = self._build_llm_instance(tools)
        response = await llm.ainvoke(lc_messages)

        tool_calls = []
        tc_list = _extract_tool_calls(response)
        for tc in tc_list:
            func = tc.get('function') or {}
            name = func.get('name', '')
            args_str = func.get('arguments', '{}')
            try:
                args = json.loads(args_str)
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(ToolCall(
                id=tc.get('id', ''),
                name=name,
                arguments=args
            ))

        return LLMResponse(
            content=response.content if hasattr(response, 'content') else str(response),
            tool_calls=tool_calls
        )
