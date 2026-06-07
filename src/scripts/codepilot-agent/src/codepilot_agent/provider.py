"""Provider configuration resolution for Python Agent.

Mirrors the Node.js provider-resolver.ts logic but runs inside the Python
subprocess. Reads credentials from environment variables injected by Node.js,
with a fallback to ~/.codepilot/settings.json for local dev.

Environment variable contract (injected by Node.js side):
  ANTHROPIC_API_KEY          — API key (or ANTHROPIC_AUTH_TOKEN)
  ANTHROPIC_BASE_URL         — optional custom base URL
  CODEPILOT_PROVIDER_ID      — which provider to use (e.g. 'env', 'custom-xxx')
  CODEPILOT_PROVIDER_TYPE    — protocol hint: anthropic / openai-compatible / openrouter / ...
  CODEPILOT_PROVIDER_NAME    — human-readable name for error messages
  CODEPILOT_MODEL           — default model for this provider
"""

from __future__ import annotations

import json
import os
import pathlib
import shutil
from dataclasses import dataclass
from typing import Any

# Path to CodePilot's data directory (mirrors Node.js side)
_DATA_DIR = pathlib.Path.home() / ".codepilot"
_SETTINGS_FILE = _DATA_DIR / "settings.json"


@dataclass
class ResolvedProvider:
    api_key: str
    base_url: str | None
    protocol: str
    model: str
    provider_id: str
    provider_name: str


def _read_settings_json() -> dict[str, Any] | None:
    """Read provider configuration from ~/.codepilot/settings.json."""
    if not _SETTINGS_FILE.exists():
        return None
    try:
        content = _SETTINGS_FILE.read_text(encoding="utf-8")
        return json.loads(content)
    except (json.JSONDecodeError, OSError):
        return None


def resolve_provider(
    env_api_key: str | None,
    env_base_url: str | None,
    provider_id: str | None,
    protocol: str | None,
    provider_name: str | None,
    model: str | None,
) -> ResolvedProvider:
    """Resolve provider from env vars + settings.json.

    Priority (mirrors Node.js side):
    1. Env vars take precedence (injected by Node.js subprocess manager)
    2. settings.json for default/override values

    Returns a ResolvedProvider with credentials for the Anthropic client.
    """
    # --- API Key ---
    # Support both Anthropic (ANTHROPIC_*) and OpenAI-compatible (OPENAI_*) conventions.
    api_key = env_api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
    if not api_key:
        raise ValueError(
            "No API key found. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) in environment or "
            "configure a provider in CodePilot settings."
        )

    # --- Base URL ---
    base_url = env_base_url or os.environ.get("ANTHROPIC_BASE_URL") or os.environ.get("OPENAI_BASE_URL") or None

    # --- Protocol ---
    resolved_protocol = protocol or os.environ.get("CODEPILOT_PROVIDER_TYPE") or "anthropic"

    # --- Model ---
    # If a model was explicitly requested, use it. Otherwise try settings.json.
    resolved_model = model or os.environ.get("CODEPILOT_MODEL") or "claude-sonnet-4-6"

    # Load settings.json for default model overrides
    settings = _read_settings_json()
    if settings:
        # Provider list in settings.json
        providers = settings.get("providers", [])
        target_id = provider_id or os.environ.get("CODEPILOT_PROVIDER_ID") or "env"

        for p in providers:
            pid = p.get("id") or p.get("name", "")
            if pid == target_id:
                # Prefer settings-level model override
                if not resolved_model or resolved_model == os.environ.get("CODEPILOT_MODEL"):
                    resolved_model = p.get("default_model") or p.get("model") or resolved_model
                # Base URL from settings
                if not base_url:
                    base_url = p.get("base_url") or None
                # API key from settings (may be encrypted — pass as-is)
                if not env_api_key:
                    api_key = p.get("api_key") or api_key
                break

        # Global default model from settings
        if not resolved_model or resolved_model == os.environ.get("CODEPILOT_MODEL"):
            global_default = settings.get("default_model")
            if global_default:
                resolved_model = global_default

    return ResolvedProvider(
        api_key=api_key,
        base_url=base_url,
        protocol=resolved_protocol,
        model=resolved_model,
        provider_id=provider_id or "env",
        provider_name=provider_name or "Python Agent",
    )
