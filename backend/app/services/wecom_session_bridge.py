import uuid
from datetime import datetime
from app.db.database import get_wecom_session, create_wecom_session, update_wecom_session_time, get_connection


def get_or_create_session(wecom_user_id: str, chat_type: str = "single", user_id: str = None) -> str:
    existing = get_wecom_session(wecom_user_id, chat_type, user_id) if user_id else None
    if existing:
        if user_id:
            update_wecom_session_time(wecom_user_id, chat_type, user_id)
        return existing["session_id"]

    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (id, title, system_prompt, temperature, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (session_id, "WeCom Chat", "You are a helpful AI assistant.", 0.7, user_id or "", now, now)
    )
    conn.commit()
    conn.close()

    if user_id:
        create_wecom_session(wecom_user_id, chat_type, session_id, user_id)
    return session_id
