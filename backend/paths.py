from __future__ import annotations

"""Hermes project root path utilities (dev + PyInstaller compatible)."""
import os
import sys
from pathlib import Path
import json
_workspace_root_cache: str | None = None


def get_project_root() -> str:
    """Return the project root directory.

    In dev mode:   <repo>/backend/
    In PyInstaller: the directory containing the executable.
    """
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return str(Path(__file__).parent.parent.resolve())


def _find_workspace_root() -> str:
    """Scan user config files to find workspace_root.

    Checks two possible project layouts:
      A: <project_root>/backend/data/users/<username>/config.json
      B: <project_root>/data/users/<username>/config.json

    Returns workspace_root from the first config that has it set,
    or '' if none found.
    """
    try:
        project_root = Path(get_project_root())
        # NOTE: Do NOT call get_data_dir() here — it depends on _find_workspace_root()
        # and would create a circular import / bootstrap deadlock.
        # Instead, derive the search roots directly from project_root.
        search_roots = [
            project_root.parent.parent / 'hermes' / 'data' / 'users',
            project_root / 'data' / 'users',
        ]
        for users_dir in search_roots:
            if not users_dir.is_dir():
                continue
            for config_file in users_dir.glob('*/config.json'):
                try:
                    cfg = json.loads(config_file.read_text(encoding='utf-8'))
                    ws = cfg.get('workspace_root', '')
                    if ws and os.path.isdir(ws):
                        return os.path.normpath(ws)
                except Exception:
                    pass
    except Exception:
        pass
    return ''


def get_workspace_root() -> str:
    """Return workspace_root from user config (cached)."""
    global _workspace_root_cache
    if _workspace_root_cache is None:
        _workspace_root_cache = _find_workspace_root()
    return _workspace_root_cache


def get_data_dir() -> str:
    """Return the data directory for Hermes.

    When workspace_root is set: <workspace_root>/hermes/data/
    Otherwise: <project_root>/data/
    """
    ws = get_workspace_root()
    if ws:
        return os.path.join(ws, 'hermes', 'data')

    if getattr(sys, 'frozen', False):
        if sys.platform == 'win32':
            base = os.environ.get('APPDATA', os.path.expanduser('~'))
        elif sys.platform == 'darwin':
            base = os.path.expanduser('~/Library/Application Support')
        else:
            base = os.environ.get('XDG_CONFIG_HOME', os.path.expanduser('~/.config'))
        return os.path.join(base, 'hermes')
    return os.path.join(get_project_root(), 'data')


def get_users_dir() -> str:
    return os.path.join(get_data_dir(), 'users')


def get_user_dir(username: str) -> str:
    return os.path.join(get_users_dir(), username)


def resolve_repo_path(username: str, repo_name: str) -> str:
    """Resolve the absolute path to a cloned repository.

    Always uses workspace_root to construct the path, so this is
    consistent with where Hermes clones repos via git_clone.
    """
    ws = get_workspace_root()
    if ws:
        return os.path.normpath(
            os.path.join(ws, 'hermes', 'data', 'users', username, 'repos', repo_name)
        )
    # Fallback: derive from get_user_dir
    return os.path.join(get_user_dir(username), 'repos', repo_name)


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)
