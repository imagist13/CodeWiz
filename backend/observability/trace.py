from __future__ import annotations

"""Observability - trace and LLM recording."""
import json
import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from threading import Lock

log = logging.getLogger(__name__)

_trace_lock = Lock()


def get_trace_path(user_dir: str) -> str:
    path = os.path.join(user_dir, 'history', 'log')
    os.makedirs(path, exist_ok=True)
    return os.path.join(path, 'trace.jsonl')


def append_trace(user_dir: str, event: dict) -> None:
    """Append a trace event to the JSONL log."""
    entry = {
        'timestamp': datetime.utcnow().isoformat(),
        **event
    }
    try:
        with _trace_lock:
            trace_path = get_trace_path(user_dir)
            with open(trace_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')

            # Truncate at 50MB
            if os.path.getsize(trace_path) > 50 * 1024 * 1024:
                _truncate_trace(trace_path)
    except Exception as e:
        log.warning(f"Trace write error: {e}")


def trace_llm_call(
    user_dir: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: float,
    provider: str
) -> None:
    append_trace(user_dir, {
        'type': 'llm_call',
        'model': model,
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
        'total_tokens': prompt_tokens + completion_tokens,
        'latency_ms': latency_ms,
        'provider': provider
    })


def trace_tool_call(
    user_dir: str,
    tool_name: str,
    duration_ms: float,
    success: bool,
    error: Optional[str] = None
) -> None:
    append_trace(user_dir, {
        'type': 'tool_call',
        'tool': tool_name,
        'duration_ms': duration_ms,
        'success': success,
        'error': error
    })


def _truncate_trace(path: str) -> None:
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    half = len(lines) // 2
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines[half:])
