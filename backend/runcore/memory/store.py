"""Memory management subsystem — delegates to the SQLite-backed memory system.

The old Markdown-file-based MemoryStore is deprecated.
All operations now go through runcore.memory.memory_db for indexed storage.
This module is kept for backward compatibility with any code that imports from it.
"""
from __future__ import annotations

from typing import Any, List, Optional

from runcore.memory.memory_db import (
    save_entry as _db_save,
    list_entries as _db_list,
    search_entries as _db_search,
    review_entry as _db_review,
    get_recent_context as _db_context,
    get_entry_count as _db_count,
)


def _ensure_project(layer_dir: str) -> None:
    """Ensure the directory exists (legacy compat)."""
    import os
    os.makedirs(layer_dir, exist_ok=True)


class MemoryStore:
    """Deprecated: delegates to SQLite-backed memory.

    Kept for backward compatibility. New code should use
    runcore.memory.memory_db directly.
    """

    def __init__(self, username: str):
        import warnings
        warnings.warn(
            "MemoryStore is deprecated. Use runcore.memory.memory_db directly.",
            DeprecationWarning,
            stacklevel=2,
        )
        self.username = username
        self._project = 'conduit'
        self._layer = 'permanent'

    def add(self, content: str, layer: str = 'permanent', tag: str = '') -> dict:
        """Add an entry (delegates to SQLite)."""
        entry_id = _db_save(
            username=self.username,
            project=self._project,
            content=content,
            layer=layer,
            tags=[tag] if tag else [],
        )
        return {'id': entry_id}

    def list(self, layer: str = 'permanent', limit: int = 50) -> List[dict]:
        """List entries (delegates to SQLite)."""
        entries = _db_list(
            username=self.username,
            project=self._project,
            layer=layer,
            limit=limit,
        )
        return [
            {
                'id': e['id'],
                'content': e['content'],
                'preview': e['content'][:200],
                'tags': e.get('tags', []),
                'timestamp': e.get('timestamp', ''),
            }
            for e in entries
        ]

    def search(self, query: str, layers: Optional[List[str]] = None) -> List[dict]:
        """Search entries (delegates to SQLite)."""
        layers = layers or ['permanent', 'temporary']
        results = _db_search(
            username=self.username,
            project=self._project,
            query=query,
            layers=layers,
            limit=50,
        )
        return [
            {
                'layer': r['layer'],
                'id': r['id'],
                'preview': r['content'][:300],
            }
            for r in results
        ]

    def forget(self, hours: int = 168) -> int:
        """Temporary: not yet implemented via SQLite."""
        return 0

    def stats(self) -> dict:
        """Return basic stats."""
        total = _db_count(self.username, self._project)
        return {
            'permanent': {'count': 0, 'size': 0},
            'temporary': {'count': 0, 'size': 0},
            'total': total,
        }
