"""Core configuration loader for Hermes.

Supports both environment variables and per-user config.json overrides.
Provider-specific keys:
  - provider: minimax | openai | deepseek | anthropic
  - model / minimax_model / deepseek_model / anthropic_model
  - api_key / minimax_api_key / deepseek_api_key / anthropic_api_key
  - base_url / minimax_base_url / deepseek_base_url
  - timeout
  - temperature, streaming, soul, etc.

Sensitive fields (api_key, *_api_key) are encrypted at rest using AES-256-GCM.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import yaml

from paths import get_project_root, get_data_dir

from core.crypto import encrypt, decrypt, ENCRYPTED_FIELDS

log = logging.getLogger(__name__)

_ROOT = get_project_root()
_DATA_DIR: str | None = None

def _get_data_dir() -> str:
    global _DATA_DIR
    if _DATA_DIR is None:
        _DATA_DIR = get_data_dir()
    return _DATA_DIR

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
_CORE_DEFAULTS: dict[str, Any] = {
    "provider": "minimax",
    "model": "gpt-4o",
    "minimax_model": "MiniMax-Text-01",
    "minimax_base_url": "https://api.minimax.chat/v1",
    "deepseek_model": "deepseek-chat",
    "deepseek_base_url": "https://api.deepseek.com",
    "anthropic_model": "claude-sonnet-4-20250514",
    "timeout": 60,
    "temperature": 0.7,
    "streaming": True,
    "max_history": 100,
    "tool_timeout": 30,
    "auto_improve_time": 0,
    "forget_time": 0,
    "font_size": 14,
    "theme": "dark",
    "soul": "",
    "max_tool_rounds": 20,
    "workspace_root": "",  # empty = auto-detect project root
}


def _load_json(path: str) -> dict[str, Any]:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_core_config() -> dict[str, Any]:
    defaults: dict[str, Any] = {}

    env_map = {
        "provider": "HERMES_PROVIDER",
        "model": "HERMES_MODEL",
        "api_key": "HERMES_API_KEY",
        "base_url": "HERMES_BASE_URL",
        "minimax_api_key": "MINIMAX_API_KEY",
        "minimax_model": "MINIMAX_MODEL",
        "minimax_base_url": "MINIMAX_BASE_URL",
        "deepseek_api_key": "DEEPSEEK_API_KEY",
        "deepseek_model": "DEEPSEEK_MODEL",
        "deepseek_base_url": "DEEPSEEK_BASE_URL",
        "anthropic_api_key": "ANTHROPIC_API_KEY",
        "anthropic_model": "ANTHROPIC_MODEL",
        "timeout": "HERMES_TIMEOUT",
        "temperature": "HERMES_TEMPERATURE",
        "soul": "HERMES_SOUL",
        "max_tool_rounds": "HERMES_MAX_TOOL_ROUNDS",
    }
    for key, env_var in env_map.items():
        val = os.environ.get(env_var, "")
        if val != "":
            if key in ("timeout", "temperature", "max_tool_rounds"):
                try:
                    defaults[key] = float(val) if key in ("temperature",) else int(val)
                except ValueError:
                    pass
            else:
                defaults[key] = val

    return defaults


_core_config: dict[str, Any] = {}
_user_defaults: dict[str, Any] = {}


def get_core_config() -> dict[str, Any]:
    global _core_config
    if not _core_config:
        _core_config = load_core_config()
    return _core_config


def get_user_defaults() -> dict[str, Any]:
    global _user_defaults
    if not _user_defaults:
        # Support both YAML and JSON formats, checked in priority order.
        # Prefer .yaml if both exist (allows migration without breaking old JSON).
        project_root = get_project_root()
        yaml_path = os.path.join(project_root, "config", "user_defaults.yaml")
        json_path = os.path.join(project_root, "config", "user_defaults.json")

        if os.path.exists(yaml_path):
            with open(yaml_path, encoding="utf-8") as f:
                _user_defaults = yaml.safe_load(f) or {}
            log.info(f"Loaded user_defaults from {yaml_path}")
        elif os.path.exists(json_path):
            _user_defaults = _load_json(json_path)
            log.info(f"Loaded user_defaults from {json_path}")
        else:
            _user_defaults = {}
            log.warning(f"No user_defaults file found (tried {yaml_path} and {json_path})")
    return _user_defaults


def _decrypt_value(key: str, value: Any) -> Any:
    """Decrypt API key fields when loading config."""
    if key in ENCRYPTED_FIELDS and isinstance(value, str) and value:
        # Encrypted values start with a base64 character (A-Z / a-z / 0-9 / + / =)
        if value and not value.startswith('{') and not value.startswith('[') and value != '':
            return decrypt(value)
    return value


def _encrypt_value(key: str, value: Any) -> Any:
    """Encrypt API key fields before saving config."""
    if key in ENCRYPTED_FIELDS and isinstance(value, str) and value:
        return encrypt(value)
    return value


def load_user_config(username: str) -> dict[str, Any]:
    project_root = get_project_root()
    search_paths = [
        os.path.join(project_root, 'data', 'users', username, 'config.json'),
        os.path.join(project_root, 'backend', 'data', 'users', username, 'config.json'),
        os.path.join(_get_data_dir(), 'users', username, 'config.json'),
    ]
    log.info(f"load_user_config: username={username}, searching: {search_paths}")

    # Start with hardcoded defaults + env overrides
    result = dict(_CORE_DEFAULTS)
    result.update(get_core_config())
    result.update(get_user_defaults())

    for config_path in search_paths:
        if os.path.exists(config_path):
            with open(config_path, encoding="utf-8") as f:
                user_config = json.load(f)
                log.info(f"load_user_config: loaded from {config_path}: {list(user_config.keys())}")
                for k, v in user_config.items():
                    result[k] = _decrypt_value(k, v)
            break
    else:
        log.warning(f"load_user_config: config not found in any of: {search_paths}")

    return result


def save_user_config(username: str, config: dict[str, Any]) -> None:
    project_root = get_project_root()
    user_dir = os.path.join(project_root, 'data', 'users', username)
    os.makedirs(user_dir, exist_ok=True)
    config_path = os.path.join(user_dir, 'config.json')

    # Preserve existing values for keys not in this update
    existing = load_user_config(username)
    merged = {**existing, **config}

    # Encrypt sensitive fields before writing
    to_write = {}
    for k, v in merged.items():
        to_write[k] = _encrypt_value(k, v)

    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(to_write, f, indent=2, ensure_ascii=False)


def get_settings(username: str | None) -> dict[str, Any]:
    """Return full merged config for a user (env → defaults → user config)."""
    if username:
        return load_user_config(username)
    result = dict(_CORE_DEFAULTS)
    result.update(get_core_config())
    result.update(get_user_defaults())
    return result


def resolve_workspace_root(config: dict[str, Any]) -> str:
    """Return the effective workspace root for tools.

    Priority:
    1. config['workspace_root'] (user-set, e.g. "D:\\桌面\\cdfg")
    2. config['repos'][0]['path'] if first cloned repo exists
    3. get_project_root() fallback
    """
    # 1. Explicit override
    if config.get('workspace_root'):
        root = config['workspace_root']
        if os.path.isdir(root):
            return os.path.abspath(root)
        log.warning(f"workspace_root set but not found: {root}")

    # 2. First cloned repo
    repos = config.get('repos') or []
    if repos and isinstance(repos, list):
        first = repos[0]
        if isinstance(first, dict):
            path = first.get('path') or ''
        else:
            path = str(first)
        if path and os.path.isdir(path):
            return os.path.abspath(path)

    # 3. Fallback to project root
    return _ROOT
