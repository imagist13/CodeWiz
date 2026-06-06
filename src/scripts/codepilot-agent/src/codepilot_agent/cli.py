"""CodePilot Agent CLI entry point.

Usage (per-request invocation, Phase 1):
    python -m codepilot_agent.cli \\
        --prompt "Hello" \\
        --model claude-sonnet-4-6 \\
        --session-id <id>

Environment variables (injected by Node.js subprocess manager):
    ANTHROPIC_API_KEY        — API key
    ANTHROPIC_BASE_URL       — optional custom endpoint
    CODEPILOT_PROVIDER_ID   — which provider to use
    CODEPILOT_MODEL         — default model

The CLI exits after a single request. Long-running session management
(Phase 2+) will use stdio JSON-RPC for keepalive.
"""

from __future__ import annotations

import argparse
import sys
import os

from codepilot_agent.chat import ChatOptions, chat_stream
from codepilot_agent.provider import resolve_provider


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="codepilot-agent",
        description="CodePilot Python Agent — lightweight Claude chat runtime",
    )
    parser.add_argument("--prompt", required=True, help="User prompt")
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
    parser.add_argument("--provider-type", default=None, help="Protocol: anthropic / openai-compatible / ...")
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


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    # Read API key / base_url from env vars injected by Node.js subprocess manager.
    # Support both Anthropic (ANTHROPIC_*) and OpenAI-compatible (OPENAI_*) conventions.
    env_api_key = (
        os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or ""
    )
    # base_url: explicit CLI arg > OPENAI_BASE_URL > ANTHROPIC_BASE_URL
    # Priority order ensures user intent (CLI) > env convention (OpenAI) > legacy (Anthropic)
    env_base_url = (
        os.environ.get("OPENAI_BASE_URL")
        or os.environ.get("ANTHROPIC_BASE_URL")
        or None
    )
    effective_base_url = args.base_url or env_base_url

    # Model and protocol also have dual env var names
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
        # Emit error SSE and exit cleanly
        import json
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

    # Protocol: explicit arg > provider protocol > default anthropic
    protocol = args.protocol or provider.protocol or "anthropic"

    # Build options
    options = ChatOptions(
        prompt=args.prompt,
        model=provider.model,
        api_key=provider.api_key,
        base_url=provider.base_url,
        system_prompt=args.system_prompt,
        max_tokens=args.max_tokens,
        thinking=build_thinking_config(args),
        session_id=args.session_id,
        protocol=protocol,
    )

    # Stream SSE to stdout
    try:
        for line in chat_stream(options):
            sys.stdout.write(line)
            sys.stdout.flush()
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as e:
        import json, traceback
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


if __name__ == "__main__":
    sys.exit(main())
