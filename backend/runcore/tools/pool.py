"""Per-user tool execution pools — prevents thread pool saturation across users."""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Any, Callable, Optional

log = logging.getLogger(__name__)

# How many workers per user — keeps long-running tools (git clone ~300s)
# from starving other users' requests.
PER_USER_WORKERS = 4

# Global ceiling on all per-user pools combined
GLOBAL_MAX_WORKERS = 32


class UserToolPool:
    """Dedicated thread pool for one user."""

    def __init__(self, username: str, max_workers: int = PER_USER_WORKERS):
        self.username = username
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix=f"tool-{username[:8]}",
        )

    def submit(self, fn: Callable[..., Any], **kwargs) -> Future:
        return self._executor.submit(fn, **kwargs)

    def shutdown(self, wait: bool = True):
        self._executor.shutdown(wait=wait)


class ToolRunner:
    """Manages per-user thread pools to prevent one user from saturating all workers."""

    def __init__(self):
        self._pools: dict[str, UserToolPool] = {}
        self._lock = threading.Lock()
        self._total_workers = 0

    def _acquire_pool(self, username: str) -> UserToolPool:
        with self._lock:
            if username not in self._pools:
                # Respect global ceiling
                if self._total_workers >= GLOBAL_MAX_WORKERS:
                    # Evict the oldest pool
                    evicted = next(iter(self._pools))
                    log.warning(f"ToolRunner: evicting pool for user '{evicted}' (global limit reached)")
                    self._pools[evicted].shutdown(wait=False)
                    self._total_workers -= PER_USER_WORKERS
                    del self._pools[evicted]

                self._pools[username] = UserToolPool(username)
                self._total_workers += PER_USER_WORKERS
                log.info(f"ToolRunner: created pool for '{username}' ({self._total_workers}/{GLOBAL_MAX_WORKERS} total workers)")

            return self._pools[username]

    def submit(self, username: str, fn: Callable[..., Any], **kwargs) -> Future:
        """Submit a tool handler to the user's pool."""
        pool = self._acquire_pool(username)
        return pool.submit(fn, **kwargs)

    def shutdown_all(self, wait: bool = True):
        """Shutdown all pools — call on application exit."""
        with self._lock:
            for username, pool in list(self._pools.items()):
                pool.shutdown(wait=wait)
            self._pools.clear()
            self._total_workers = 0


# Global singleton
_tool_runner: Optional[ToolRunner] = None
_runner_lock = threading.Lock()


def get_tool_runner() -> ToolRunner:
    global _tool_runner
    if _tool_runner is None:
        with _runner_lock:
            if _tool_runner is None:
                _tool_runner = ToolRunner()
    return _tool_runner


def shutdown_tool_runner():
    """Call on application shutdown."""
    global _tool_runner
    if _tool_runner is not None:
        _tool_runner.shutdown_all(wait=True)
        _tool_runner = None
