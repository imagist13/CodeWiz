from __future__ import annotations

"""User context management via ContextVar (thread/coroutine isolation)."""
import contextvars
from typing import Optional

from core.config import resolve_workspace_root
from runcore.security import set_workspace_root

# Current user context (isolated per coroutine/thread)
_current_username: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar('username', default=None)
_current_user_config: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar('user_config', default=None)
_current_conversation_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar('conversation_id', default=None)


def set_user_context(username: str, config: dict) -> None:
    _current_username.set(username)
    _current_user_config.set(config)
    # Set workspace root so all tools operate in the user's project directory
    root = resolve_workspace_root(config)
    set_workspace_root(root)


def get_username() -> Optional[str]:
    return _current_username.get()


def get_user_config() -> Optional[dict]:
    return _current_user_config.get()


def get_conversation_id() -> Optional[str]:
    return _current_conversation_id.get()


def set_conversation_id(conv_id: str) -> None:
    _current_conversation_id.set(conv_id)


def clear_context() -> None:
    _current_username.set(None)
    _current_user_config.set(None)
    _current_conversation_id.set(None)
    set_workspace_root(None)


class UserContext:
    """Context manager for user isolation."""
    def __init__(self, username: str, config: dict):
        self.username = username
        self.config = config
        self._token: Optional[contextvars.Token] = None
        self._conv_token: Optional[contextvars.Token] = None

    def __enter__(self):
        self._token = _current_username.set(self.username)
        self._conv_token = _current_conversation_id.set(None)
        _current_user_config.set(self.config)
        set_workspace_root(resolve_workspace_root(self.config))
        return self

    def __exit__(self, *args):
        clear_context()
