"""用户级线程锁 — 防止同一用户并发对话导致状态串号"""

import threading
from contextlib import contextmanager

_user_locks: dict[str, threading.RLock] = {}
_locks_lock = threading.Lock()


def get_user_lock(user_id: str) -> threading.RLock:
    with _locks_lock:
        if user_id not in _user_locks:
            _user_locks[user_id] = threading.RLock()
        return _user_locks[user_id]


@contextmanager
def acquire_user_lock(user_id: str):
    lock = get_user_lock(user_id)
    lock.acquire()
    try:
        yield
    finally:
        lock.release()
