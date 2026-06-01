import sqlite3
import uuid
from pathlib import Path
from datetime import datetime
from typing import List, Optional

DATA_DIR = Path("./data")
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "harness.db"


def get_connection():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _pk_columns(cursor, table: str) -> List[str]:
    """Return PK column names of `table` ordered by their PK index."""
    cursor.execute(f"PRAGMA table_info({table})")
    cols = [row for row in cursor.fetchall() if row[5] > 0]
    cols.sort(key=lambda r: r[5])
    return [r[1] for r in cols]


def _drop_if_pk_mismatch(cursor, table: str, expected_pk: List[str]) -> bool:
    """Drop `table` if it exists but its PK doesn't match expected. Returns True if dropped."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    if not cursor.fetchone():
        return False
    if _pk_columns(cursor, table) != expected_pk:
        cursor.execute(f"DROP TABLE {table}")
        return True
    return False


def _has_unique_index(cursor, table: str, cols: List[str]) -> bool:
    """True if `table` has a unique index covering exactly `cols` (any order)."""
    cursor.execute(f"PRAGMA index_list({table})")
    for idx in cursor.fetchall():
        if not idx[2]:  # not unique
            continue
        cursor.execute(f"PRAGMA index_info({idx[1]})")
        idx_cols = sorted(c[2] for c in cursor.fetchall())
        if idx_cols == sorted(cols):
            return True
    return False


def _drop_if_unique_missing(cursor, table: str, cols: List[str]) -> bool:
    """Drop `table` if it lacks a unique index covering `cols`. Returns True if dropped."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    if not cursor.fetchone():
        return False
    if not _has_unique_index(cursor, table, cols):
        cursor.execute(f"DROP TABLE {table}")
        return True
    return False


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            phone TEXT UNIQUE,
            hashed_password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CHECK(email IS NOT NULL OR phone IS NOT NULL)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New Session',
            system_prompt TEXT DEFAULT 'You are a helpful AI assistant.',
            temperature REAL DEFAULT 0.7,
            mode TEXT NOT NULL DEFAULT 'agent' CHECK(mode IN ('agent', 'rag')),
            domain_id TEXT,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
            content TEXT NOT NULL DEFAULT '',
            tool_calls TEXT,
            tool_call_id TEXT,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Migrate tool_configs if schema is outdated (missing config column or wrong PK)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_configs'")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(tool_configs)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'config' not in columns:
            cursor.execute("DROP TABLE tool_configs")
        else:
            _drop_if_pk_mismatch(cursor, 'tool_configs', ['name', 'user_id'])

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tool_configs (
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'agent',
            description TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            parameters TEXT,
            config TEXT,
            code TEXT,
            user_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (name, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Migrate: rename 'python' type to 'agent'
    cursor.execute("UPDATE tool_configs SET type = 'agent' WHERE type = 'python'")

    # Clean up old built-in tools
    old_tool_names = [
        'get_current_time', 'calculator', 'get_weather',
        'detect_language', 'get_supported_languages',
        'translate_text', 'summarize_text',
    ]
    for name in old_tool_names:
        cursor.execute("DELETE FROM tool_configs WHERE name = ?", (name,))

    # Remove execute_code built-in tool (moved to user-managed tools)
    cursor.execute("DELETE FROM tool_configs WHERE name = ?", ('execute_code',))

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)
    """)

    # Migrate: add wecom_msgid column to messages if missing
    cursor.execute("PRAGMA table_info(messages)")
    msg_columns = [row[1] for row in cursor.fetchall()]
    if 'wecom_msgid' not in msg_columns:
        cursor.execute("ALTER TABLE messages ADD COLUMN wecom_msgid TEXT")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_wecom_msgid ON messages(wecom_msgid)")

    # Migrate: add skill_name column to messages if missing
    if 'skill_name' not in msg_columns:
        cursor.execute("ALTER TABLE messages ADD COLUMN skill_name TEXT")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_skill_name ON messages(skill_name)")

    # Migrate: add reasoning_content column to messages if missing
    if 'reasoning_content' not in msg_columns:
        cursor.execute("ALTER TABLE messages ADD COLUMN reasoning_content TEXT")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversation_summaries (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            message_count_before INTEGER NOT NULL DEFAULT 0,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_summaries_session ON conversation_summaries(session_id, created_at)
    """)

    # wecom_config — drop if missing UNIQUE(user_id)
    _drop_if_unique_missing(cursor, 'wecom_config', ['user_id'])

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wecom_config (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            bot_id TEXT,
            secret_encrypted TEXT,
            bound_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # wecom_sessions — drop if UNIQUE doesn't cover (wecom_user_id, chat_type, user_id)
    _drop_if_unique_missing(cursor, 'wecom_sessions', ['wecom_user_id', 'chat_type', 'user_id'])

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wecom_sessions (
            id TEXT PRIMARY KEY,
            wecom_user_id TEXT NOT NULL,
            chat_type TEXT NOT NULL DEFAULT 'single',
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(wecom_user_id, chat_type, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_wecom_sessions_lookup ON wecom_sessions(wecom_user_id, chat_type, user_id)
    """)

    # RAG domains table — drop if UNIQUE doesn't cover (name, user_id)
    _drop_if_unique_missing(cursor, 'rag_domains', ['name', 'user_id'])

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rag_domains (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # RAG documents metadata table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rag_documents (
            id TEXT PRIMARY KEY,
            domain_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT,
            file_type TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'parsing', 'segmenting', 'embedding', 'ready', 'failed')),
            chunk_count INTEGER DEFAULT 0,
            chunk_size INTEGER DEFAULT 500,
            chunk_overlap INTEGER DEFAULT 50,
            smart_split INTEGER DEFAULT 1,
            error_msg TEXT,
            user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (domain_id) REFERENCES rag_domains(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_rag_docs_status ON rag_documents(status)
    """)

    # system_settings table — drop if PK isn't the new composite (user_id, key)
    _drop_if_pk_mismatch(cursor, 'system_settings', ['user_id', 'key'])

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            user_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ========== Migrations for existing DBs ==========

    # sessions
    cursor.execute("PRAGMA table_info(sessions)")
    session_cols = [row[1] for row in cursor.fetchall()]
    if 'mode' not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'agent' CHECK(mode IN ('agent', 'rag'))")
    if 'domain_id' not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN domain_id TEXT")
    if 'pinned' not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0")
    if 'user_id' not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    # messages: add user_id
    cursor.execute("PRAGMA table_info(messages)")
    msg_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in msg_cols:
        cursor.execute("ALTER TABLE messages ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    # tool_configs: add user_id
    cursor.execute("PRAGMA table_info(tool_configs)")
    tc_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in tc_cols:
        cursor.execute("ALTER TABLE tool_configs ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    # conversation_summaries: add user_id
    cursor.execute("PRAGMA table_info(conversation_summaries)")
    cs_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in cs_cols:
        cursor.execute("ALTER TABLE conversation_summaries ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    # wecom_config: add user_id
    cursor.execute("PRAGMA table_info(wecom_config)")
    wc_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in wc_cols:
        cursor.execute("ALTER TABLE wecom_config ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    # wecom_sessions: add user_id
    cursor.execute("PRAGMA table_info(wecom_sessions)")
    ws_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in ws_cols:
        cursor.execute("ALTER TABLE wecom_sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    # rag_domains: add user_id
    cursor.execute("PRAGMA table_info(rag_domains)")
    rd_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in rd_cols:
        cursor.execute("ALTER TABLE rag_domains ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    # rag_documents: add user_id
    cursor.execute("PRAGMA table_info(rag_documents)")
    rdoc_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in rdoc_cols:
        cursor.execute("ALTER TABLE rag_documents ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")
    if 'domain_id' not in rdoc_cols:
        cursor.execute("ALTER TABLE rag_documents ADD COLUMN domain_id TEXT")

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_rag_docs_domain ON rag_documents(domain_id)
    """)

    # system_settings: add user_id
    cursor.execute("PRAGMA table_info(system_settings)")
    ss_cols = [row[1] for row in cursor.fetchall()]
    if 'user_id' not in ss_cols:
        cursor.execute("ALTER TABLE system_settings ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE")

    conn.commit()
    conn.close()


# ========== Helper functions ==========

def insert_summary(session_id: str, user_id: str, content: str, message_count_before: int) -> str:
    conn = get_connection()
    cursor = conn.cursor()
    summary_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO conversation_summaries (id, session_id, content, message_count_before, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (summary_id, session_id, content, message_count_before, user_id, now)
    )
    conn.commit()
    conn.close()
    return summary_id


def get_latest_summary(session_id: str) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM conversation_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
        (session_id,)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_messages_after_summary(session_id: str, summary: Optional[dict]) -> List[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    if summary:
        cursor.execute(
            "SELECT * FROM messages WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC",
            (session_id, summary["created_at"])
        )
    else:
        cursor.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,)
        )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_wecom_config(user_id: str) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM wecom_config WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def set_wecom_config(user_id: str, bot_id: str, secret_encrypted: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    config_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO wecom_config (id, user_id, bot_id, secret_encrypted, bound_at, created_at) VALUES (?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(user_id) DO UPDATE SET bot_id=excluded.bot_id, secret_encrypted=excluded.secret_encrypted, bound_at=excluded.bound_at",
        (config_id, user_id, bot_id, secret_encrypted, now, now)
    )
    conn.commit()
    conn.close()


def delete_wecom_config(user_id: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM wecom_config WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM wecom_sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()


def get_wecom_session(wecom_user_id: str, chat_type: str, user_id: str) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM wecom_sessions WHERE wecom_user_id = ? AND chat_type = ? AND user_id = ?",
        (wecom_user_id, chat_type, user_id)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_wecom_session(wecom_user_id: str, chat_type: str, session_id: str, user_id: str) -> str:
    conn = get_connection()
    cursor = conn.cursor()
    ws_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO wecom_sessions (id, wecom_user_id, chat_type, session_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (ws_id, wecom_user_id, chat_type, session_id, user_id, now, now)
    )
    conn.commit()
    conn.close()
    return ws_id


def update_wecom_session_time(wecom_user_id: str, chat_type: str, user_id: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute(
        "UPDATE wecom_sessions SET updated_at = ? WHERE wecom_user_id = ? AND chat_type = ? AND user_id = ?",
        (now, wecom_user_id, chat_type, user_id)
    )
    conn.commit()
    conn.close()


def get_system_setting(user_id: str, key: str) -> Optional[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM system_settings WHERE user_id = ? AND key = ?", (user_id, key))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else None


def set_system_setting(user_id: str, key: str, value: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO system_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (user_id, key, value, now)
    )
    conn.commit()
    conn.close()


def get_all_system_settings(user_id: str) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM system_settings WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}


def delete_system_setting(user_id: str, key: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM system_settings WHERE user_id = ? AND key = ?", (user_id, key))
    conn.commit()
    conn.close()
