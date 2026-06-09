"""CodePilot Agent CLI entry point.

Supports two modes:

Mode 1 — One-shot (--prompt): Single request, one response.
    python -m codepilot_agent.cli \
        --prompt "Hello" \
        --model claude-sonnet-4-6 \
        --session-id <id>

Mode 2 — Session (--session-mode): Long-running session with multi-turn
    tool-use support via JSON-RPC over stdin/stdout.

    python -m codepilot_agent.cli --session-mode

    Protocol (JSON-RPC over stdin):
        {"jsonrpc":"2.0","id":1,"method":"init","params":{...}}
        {"jsonrpc":"2.0","id":2,"method":"message","params":{"prompt":"..."}}
        {"jsonrpc":"2.0","id":3,"method":"interrupt","params":{}}
        {"jsonrpc":"2.0","id":4,"method":"reset","params":{}}
        {"jsonrpc":"2.0","id":5,"method":"delete","params":{}}

    Protocol (SSE over stdout):
        data: {"type":"status","data":"{...}"}\n\n
        data: {"type":"text","data":"..."}\n\n
        data: {"type":"thinking","data":"..."}\n\n
        data: {"type":"tool_use","data":"{...}"}\n\n
        data: {"type":"tool_result","data":"{...}"}\n\n
        data: {"type":"error","data":"{...}"}\n\n
        data: {"type":"done","data":""}\n\n

Environment variables (injected by Node.js subprocess manager):
    ANTHROPIC_API_KEY        — API key
    ANTHROPIC_BASE_URL       — optional custom endpoint
    CODEPILOT_PROVIDER_ID   — which provider to use
    CODEPILOT_MODEL         — default model
    CODEPILOT_PROVIDER_TYPE — protocol: anthropic / openai-compatible
"""

from __future__ import annotations

import argparse
import json
import sys
import os

from codepilot_agent.chat import ChatOptions, chat_stream
from codepilot_agent.provider import resolve_provider
from codepilot_agent.agent import run_session_mode


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="codepilot-agent",
        description="CodePilot Python Agent — lightweight Claude chat runtime with tool support",
    )
    # Mode selection
    parser.add_argument(
        "--session-mode",
        action="store_true",
        help="Run in session mode (JSON-RPC over stdin/stdout for multi-turn tool-use)",
    )
    # One-shot mode args
    parser.add_argument("--prompt", help="User prompt (one-shot mode)")
    parser.add_argument("--model", default=None, help="Model ID (e.g. claude-sonnet-4-6)")
    parser.add_argument("--session-id", default=None, help="Session ID for resume tracking")
    parser.add_argument("--system-prompt", default=None, help="System prompt")
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=8192,
        help="Max output tokens (default: 8192)",
    )
    parser.add_argument(
        "--thinking",
        choices=["enabled", "adaptive", "disabled"],
        default=None,
        help="Thinking mode",
    )
    parser.add_argument(
        "--thinking-budget",
        type=int,
        default=None,
        help="Thinking budget tokens (requires --thinking enabled)",
    )
    parser.add_argument("--provider-id", default=None, help="Provider ID")
    parser.add_argument(
        "--provider-type",
        default=None,
        help="Protocol: anthropic / openai-compatible / ...",
    )
    parser.add_argument("--provider-name", default=None, help="Human-readable provider name")
    parser.add_argument("--base-url", default=None, help="API base URL override")
    parser.add_argument(
        "--protocol",
        choices=["anthropic", "openai-compatible"],
        default=None,
        help="Wire protocol: anthropic (default) or openai-compatible (e.g. MiniMax)",
    )
    return parser.parse_args(argv)


def build_thinking_config(args: argparse.Namespace) -> dict | None:
    if not args.thinking:
        return None
    result: dict = {"type": args.thinking}
    if args.thinking == "enabled" and args.thinking_budget:
        result["budget_tokens"] = args.thinking_budget
    return result


def run_one_shot(args: argparse.Namespace) -> int:
    """Run a single request and exit (Phase 1 compatibility)."""
    # Read API key / base_url from env vars injected by Node.js subprocess manager.
    env_api_key = (
        os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or ""
    )
    env_base_url = (
        os.environ.get("OPENAI_BASE_URL")
        or os.environ.get("ANTHROPIC_BASE_URL")
        or None
    )
    effective_base_url = args.base_url or env_base_url

    env_model = os.environ.get("CODEPILOT_MODEL") or os.environ.get("OPENAI_MODEL") or None
    env_protocol = os.environ.get("CODEPILOT_PROVIDER_TYPE") or None

    # Resolve provider
    try:
        provider = resolve_provider(
            env_api_key=env_api_key or None,
            env_base_url=effective_base_url,
            provider_id=args.provider_id,
            protocol=args.provider_type or env_protocol,
            provider_name=args.provider_name,
            model=args.model or env_model,
        )
    except ValueError as e:
        sys.stderr.write(f"[codepilot-agent] Provider resolution failed: {e}\n")
        error_payload = {
            "type": "error",
            "data": {
                "category": "NO_CREDENTIALS",
                "userMessage": str(e),
                "actionHint": "Configure API key in CodePilot settings.",
                "retryable": False,
                "details": str(e),
                "rawMessage": str(e),
                "_formattedMessage": str(e),
            },
        }
        sys.stdout.write(f"data: {json.dumps(error_payload)}\n\n")
        sys.stdout.write(f"data: {json.dumps({'type': 'done', 'data': ''})}\n\n")
        sys.stdout.flush()
        return 1

    protocol = args.protocol or provider.protocol or "anthropic"

    options = ChatOptions(
        prompt=args.prompt or "",
        model=provider.model,
        api_key=provider.api_key,
        base_url=provider.base_url,
        system_prompt=args.system_prompt,
        max_tokens=args.max_tokens,
        thinking=build_thinking_config(args),
        session_id=args.session_id,
        protocol=protocol,
    )

    try:
        for line in chat_stream(options):
            sys.stdout.write(line)
            sys.stdout.flush()
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as e:
        import traceback
        sys.stderr.write(f"[codepilot-agent] Unexpected error: {e}\n{traceback.format_exc()}\n")
        error_payload = {
            "type": "error",
            "data": {
                "category": "UNKNOWN_ERROR",
                "userMessage": str(e),
                "actionHint": "Check logs for details.",
                "retryable": False,
                "details": str(e),
                "rawMessage": str(e),
                "_formattedMessage": str(e),
            },
        }
        sys.stdout.write(f"data: {json.dumps(error_payload)}\n\n")
        sys.stdout.write(f"data: {json.dumps({'type': 'done', 'data': ''})}\n\n")
        sys.stdout.flush()
        return 1


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.session_mode:
        # Session mode: run the agent loop with JSON-RPC
        run_session_mode()
        return 0
    else:
        # One-shot mode (backward compatible)
        if not args.prompt:
            sys.stderr.write("[codepilot-agent] Error: --prompt is required in one-shot mode\n")
            return 1
        return run_one_shot(args)


if __name__ == "__main__":
    sys.exit(main())
