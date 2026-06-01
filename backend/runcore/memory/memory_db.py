"""Memory storage backed by SQLite — replaces JSONL for indexed search.

Schema:
  memory_entries(id, user_id, project, layer, content, tags_json,
                created_at, reviewed, promoted_at)

Indexes:
  - (user_id, project, layer, created_at)  — list/recent queries
  - (user_id, project, layer, reviewed)    — review queries

Migration: if old JSONL files exist, they are migrated on first access.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import uuid
from datetime import datetime
from typing import Any, Optional

from paths import get_data_dir, get_user_dir

log = logging.getLogger(__name__)

_DB_PATH = os.path.join(get_data_dir(), 'memory.db')
_DBCONN: Optional[sqlite3.Connection] = None
_DBLOCK = threading.Lock()


def _get_db() -> sqlite3.Connection:
    global _DBCONN
    if _DBCONN is None:
        with _DBLOCK:
            if _DBCONN is None:
                os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
                _DBCONN = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
                _DBCONN.row_factory = sqlite3.Row
                _init_schema(_DBCONN)
    return _DBCONN


def _init_schema(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memory_entries (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            project     TEXT NOT NULL,
            layer      TEXT NOT NULL DEFAULT 'temporary',
            content     TEXT NOT NULL,
            tags_json   TEXT NOT NULL DEFAULT '[]',
            reviewed    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            promoted_at TEXT
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_mem_list
            ON memory_entries(user_id, project, layer, created_at DESC)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_mem_review
            ON memory_entries(user_id, project, layer, reviewed)
    """)
    conn.commit()


_OLD_MEMORY_ROOT = 'improve/memory'


def _jsonl_migration_needed(username: str, project: str, layer: str) -> bool:
    new_path = os.path.join(get_user_dir(username), 'memory', project, layer, 'entries.jsonl')
    if os.path.exists(new_path):
        return False
    old_path = os.path.join(get_user_dir(username), _OLD_MEMORY_ROOT, layer, 'entries.jsonl')
    return os.path.exists(old_path)


def _migrate_jsonl(username: str, project: str, layer: str) -> int:
    entries_file = os.path.join(get_user_dir(username), 'memory', project, layer, 'entries.jsonl')
    if not os.path.exists(entries_file):
        entries_file = os.path.join(get_user_dir(username), _OLD_MEMORY_ROOT, layer, 'entries.jsonl')
    if not os.path.exists(entries_file):
        return 0

    migrated = 0
    conn = _get_db()
    now = datetime.utcnow().isoformat()

    try:
        with open(entries_file, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    entry_id = entry.get('id') or f'mig_{uuid.uuid4().hex[:12]}'
                    tags = json.dumps(entry.get('tags', []))
                    conn.execute(
                        """INSERT OR IGNORE INTO memory_entries
                           (id, user_id, project, layer, content, tags_json, reviewed, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            entry_id,
                            username,
                            project,
                            layer,
                            entry.get('content', ''),
                            tags,
                            1 if entry.get('reviewed') else 0,
                            entry.get('timestamp', now),
                        )
                    )
                    migrated += 1
                except Exception:
                    pass
        conn.commit()
        log.info(f"Migrated {migrated} JSONL entries for {username}/{project}/{layer}")
    except Exception as e:
        log.warning(f"JSONL migration failed for {username}/{project}/{layer}: {e}")

    return migrated


def save_entry(
    username: str,
    project: str,
    content: str,
    layer: str = 'temporary',
    tags: Optional[list[str]] = None,
    entry_id: Optional[str] = None,
) -> str:
    conn = _get_db()

    if _jsonl_migration_needed(username, project, layer):
        _migrate_jsonl(username, project, layer)

    eid = entry_id or f'mem_{datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")}'
    tags = tags or []
    now = datetime.utcnow().isoformat()

    conn.execute(
        """INSERT OR REPLACE INTO memory_entries
           (id, user_id, project, layer, content, tags_json, reviewed, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (eid, username, project, layer, content, json.dumps(tags, ensure_ascii=False),
         1 if layer == 'permanent' else 0, now)
    )
    conn.commit()
    return eid


def list_entries(
    username: str,
    project: str,
    layer: str = 'permanent',
    limit: int = 20,
) -> list[dict]:
    conn = _get_db()

    if _jsonl_migration_needed(username, project, layer):
        _migrate_jsonl(username, project, layer)

    cursor = conn.execute(
        """SELECT id, content, tags_json, reviewed, created_at
           FROM memory_entries
           WHERE user_id=? AND project=? AND layer=?
           ORDER BY created_at DESC
           LIMIT ?""",
        (username, project, layer, limit)
    )
    rows = cursor.fetchall()
    return [
        {
            'id': r['id'],
            'content': r['content'],
            'tags': json.loads(r['tags_json']),
            'reviewed': bool(r['reviewed']),
            'timestamp': r['created_at'],
        }
        for r in rows
    ]


def search_entries(
    username: str,
    project: str,
    query: str,
    layers: Optional[list[str]] = None,
    limit: int = 10,
) -> list[dict]:
    conn = _get_db()
    layers = layers or ['permanent', 'temporary']

    placeholders = ','.join('?' * len(layers))
    cursor = conn.execute(
        f"""SELECT id, content, tags_json, layer, reviewed, created_at
           FROM memory_entries
           WHERE user_id=? AND project=? AND layer IN ({placeholders})
           ORDER BY created_at DESC
           LIMIT 200""",
        [username, project] + layers
    )
    all_entries = cursor.fetchall()

    query_words = set(query.lower().split())
    scored = []
    for r in all_entries:
        content_lower = r['content'].lower()
        tags = json.loads(r['tags_json'])
        tag_lower = [t.lower() for t in tags]
        score = 0
        for word in query_words:
            if word in content_lower:
                score += 2
            if word in tag_lower:
                score += 5
        if score > 0:
            scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            'id': r['id'],
            'layer': r['layer'],
            'score': score,
            'content': r['content'],
            'tags': json.loads(r['tags_json']),
            'timestamp': r['created_at'],
        }
        for score, r in scored[:limit]
    ]


def review_entry(
    username: str,
    project: str,
    entry_id: str,
    action: str = 'promote',
) -> dict:
    conn = _get_db()

    cursor = conn.execute(
        "SELECT * FROM memory_entries WHERE id=? AND user_id=? AND project=?",
        (entry_id, username, project)
    )
    row = cursor.fetchone()
    if not row:
        return {'success': False, 'error': 'Entry not found'}

    if action == 'discard':
        conn.execute("DELETE FROM memory_entries WHERE id=?", (entry_id,))
        conn.commit()
        return {'success': True, 'action': 'discard', 'entry_id': entry_id}

    if row['layer'] == 'temporary':
        now = datetime.utcnow().isoformat()
        conn.execute(
            """UPDATE memory_entries
               SET layer='permanent', reviewed=1, promoted_at=?
               WHERE id=?""",
            (now, entry_id)
        )
        conn.commit()
        return {'success': True, 'action': 'promote', 'entry_id': entry_id}

    return {'success': True, 'action': 'no_change', 'entry_id': entry_id}


def get_recent_context(
    username: str,
    project: str,
    limit: int = 10,
) -> dict:
    conn = _get_db()

    cursor = conn.execute(
        """SELECT id, content, tags_json, layer, created_at
           FROM memory_entries
           WHERE user_id=? AND project=?
           ORDER BY created_at DESC
           LIMIT ?""",
        (username, project, limit)
    )
    rows = cursor.fetchall()

    recent = [
        {
            'id': r['id'],
            'layer': r['layer'],
            'preview': r['content'][:200],
            'timestamp': r['created_at'],
            'tags': json.loads(r['tags_json']),
        }
        for r in rows
    ]
    return {
        'project': project,
        'recent': recent,
        'total': len(recent),
    }


def get_entry_count(username: str, project: str) -> int:
    conn = _get_db()
    cursor = conn.execute(
        "SELECT COUNT(*) FROM memory_entries WHERE user_id=? AND project=?",
        (username, project)
    )
    return cursor.fetchone()[0]
