"""Lightweight chat core — streams responses as SSE events.

Supports two wire protocols:
  - "anthropic"   — direct Anthropic API (via anthropic Python SDK)
  - "openai-compatible" — OpenAI-compatible API (via openai Python SDK,
                           e.g. MiniMax, OpenRouter, custom proxies)

SSE format (matches TypeScript stream-session-manager):
    data: {"type":"text",   "data":"Hello"}\n\n
    data: {"type":"status", "data":"{\"session_id\":\"...\",\"model\":\"...\"}"}\n\n
    data: {"type":"result", "data":"{\"usage\":{...},\"num_turns\":1,...}"}\n\n
    data: {"type":"error",  "data":"{\"category\":\"...\",\"userMessage\":\"...\"}"}\n\n
    data: {"type":"done",  "data":""}\n\n

The inner "data" field is always a JSON string; callers are responsible for
json.dumps-ing nested objects before passing them in.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Iterator

import anthropic
import openai


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class ChatOptions:
    prompt: str
    model: str
    api_key: str
    base_url: str | None = None
    system_prompt: str | None = None
    max_tokens: int = 8192
    thinking: dict | None = None  # {type, budget_tokens?} — Anthropic only
    session_id: str | None = None
    protocol: str = "anthropic"  # "anthropic" | "openai-compatible"


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse(event_type: str, data: str) -> str:
    return f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"


def _sse_text(text: str) -> str:
    return _sse("text", text)


def _sse_status(session_id: str | None, model: str) -> str:
    return _sse("status", json.dumps({"session_id": session_id or "", "model": model}))


def _sse_result(
    usage: dict,
    session_id: str | None,
    subtype: str = "end_turn",
    duration_ms: int | None = None,
) -> str:
    payload: dict[str, Any] = {
        "subtype": subtype,
        "is_error": False,
        "num_turns": 1,
        "usage": usage,
        "session_id": session_id or "",
    }
    if duration_ms is not None:
        payload["duration_ms"] = duration_ms
    return _sse("result", json.dumps(payload))


def _sse_error(
    message: str,
    category: str = "UNKNOWN_ERROR",
    action_hint: str = "",
) -> str:
    return _sse(
        "error",
        json.dumps({
            "category": category,
            "userMessage": message,
            "actionHint": action_hint or "Check your API key and network connection.",
            "retryable": False,
            "details": message,
            "rawMessage": message,
            "_formattedMessage": message,
        }),
    )


def _sse_done() -> str:
    return _sse("done", "")


# ---------------------------------------------------------------------------
# Anthropic backend
# ---------------------------------------------------------------------------

def _stream_anthropic(options: ChatOptions) -> Iterator[str]:
    client = anthropic.Anthropic(
        api_key=options.api_key,
        **( {"base_url": options.base_url} if options.base_url else {} ),
    )

    call_kwargs: dict[str, Any] = {
        "model": options.model,
        "max_tokens": options.max_tokens,
        "messages": [{"role": "user", "content": options.prompt}],
    }
    if options.system_prompt:
        call_kwargs["system"] = options.system_prompt

        # Thinking config (Anthropic native; MiniMax may support via its own extension)
        # Defaults to enabled with budget_tokens=-1 (adaptive) if not specified
        if options.thinking:
            th = options.thinking
            if th.get("type") == "enabled":
                budget = th.get("budget_tokens", 1024)
                call_kwargs["thinking"] = anthropic.types.ThinkingConfigEnabledParam(budget_tokens=budget)
            elif th.get("type") == "disabled":
                call_kwargs["thinking"] = anthropic.types.ThinkingConfigDisabledParam()
            elif th.get("type") == "adaptive":
                # Adaptive = enabled with default budget; omit type field
                call_kwargs["thinking"] = anthropic.types.ThinkingConfigEnabledParam()

    input_tokens = 0
    output_tokens = 0
    cache_creation_tokens = 0

    try:
        with client.messages.stream(**call_kwargs) as stream:
            for event in stream:
                if event.type == "message_start":
                    input_tokens = event.message.usage.input_tokens
                elif event.type == "content_block_delta":
                    delta = event.delta
                    # MiniMax sends "thinking_delta" and "signature_delta" alongside "text_delta"
                    delta_type = getattr(delta, "type", None)
                    if delta_type == "text_delta":
                        yield _sse_text(delta.text)
                elif event.type == "message_delta":
                    output_tokens = getattr(event.usage, "output_tokens", 0) or 0
                    cache_creation_tokens = getattr(
                        event.usage, "cache_creation_input_tokens", 0
                    ) or cache_creation_tokens

        yield _sse_result(
            {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": cache_creation_tokens,
            },
            options.session_id,
        )

    except anthropic.APIError as e:
        yield _sse_error(str(e), category="API_ERROR")
    except anthropic.RateLimitError as e:
        yield _sse_error(str(e), category="RATE_LIMIT", action_hint="Rate limit hit. Wait and retry.")
    except anthropic.AuthenticationError as e:
        yield _sse_error(str(e), category="AUTH_ERROR", action_hint="Check your API key in CodePilot settings.")
    except Exception as e:  # noqa: BLE001
        yield _sse_error(str(e), category="UNKNOWN_ERROR")


# ---------------------------------------------------------------------------
# OpenAI-compatible backend (MiniMax, OpenRouter, custom proxies)
# ---------------------------------------------------------------------------

def _stream_openai_compatible(options: ChatOptions) -> Iterator[str]:
    client = openai.OpenAI(
        api_key=options.api_key,
        base_url=options.base_url or "https://api.openai.com/v1",
    )

    messages: list[dict[str, str]] = []
    if options.system_prompt:
        messages.append({"role": "system", "content": options.system_prompt})
    messages.append({"role": "user", "content": options.prompt})

    call_kwargs: dict[str, Any] = {
        "model": options.model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    # MiniMax thinking support via extra_body
    if options.thinking and options.thinking.get("type") in ("adaptive", "disabled"):
        call_kwargs["extra_body"] = {"thinking": {"type": options.thinking["type"]}}

    input_tokens = 0
    output_tokens = 0

    try:
        stream = client.chat.completions.create(**call_kwargs)
        for event in stream:
            if event.choices:
                delta = event.choices[0].delta
                if delta and delta.content:
                    yield _sse_text(delta.content)
            # usage from the final [DONE] event via stream_options
            if event.usage:
                input_tokens = event.usage.prompt_tokens or 0
                output_tokens = event.usage.completion_tokens or 0

        yield _sse_result(
            {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0,
            },
            options.session_id,
        )

    except openai.APIError as e:
        yield _sse_error(str(e), category="API_ERROR")
    except openai.RateLimitError as e:
        yield _sse_error(str(e), category="RATE_LIMIT", action_hint="Rate limit hit. Wait and retry.")
    except openai.AuthenticationError as e:
        yield _sse_error(str(e), category="AUTH_ERROR", action_hint="Check your API key in CodePilot settings.")
    except Exception as e:  # noqa: BLE001
        yield _sse_error(str(e), category="UNKNOWN_ERROR")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def chat_stream(options: ChatOptions) -> Iterator[str]:
    """Stream chat responses as SSE lines, dispatching by protocol."""
    yield _sse_status(options.session_id, options.model)

    if options.protocol == "openai-compatible":
        yield from _stream_openai_compatible(options)
    else:
        yield from _stream_anthropic(options)

    yield _sse_done()
