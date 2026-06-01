from fastapi import APIRouter, Depends, HTTPException
import uuid
from datetime import datetime

from app.db.database import get_connection
from app.models.session import SessionCreate, SessionUpdate
from app.core.response import success, ApiResponse
from app.core.security import get_current_user

router = APIRouter()


def _check_session_owner(session_id: str, user_id: str) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return dict(row)


@router.post("", response_model=ApiResponse)
async def create_session(data: SessionCreate, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    mode = data.mode or "agent"
    domain_id = data.domain_id

    cursor.execute(
        "INSERT INTO sessions (id, title, system_prompt, temperature, mode, domain_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (session_id, data.title, data.system_prompt, data.temperature, mode, domain_id, current_user["id"], now, now)
    )
    conn.commit()
    conn.close()

    return success({"id": session_id, "title": data.title, "mode": mode, "domain_id": domain_id})


@router.get("", response_model=ApiResponse)
async def list_sessions(mode: str = None, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    if mode:
        cursor.execute(
            "SELECT s.*, COUNT(m.id) as message_count FROM sessions s LEFT JOIN messages m ON s.id = m.session_id WHERE s.user_id = ? AND s.mode = ? GROUP BY s.id ORDER BY s.pinned DESC, s.updated_at DESC",
            (current_user["id"], mode)
        )
    else:
        cursor.execute(
            "SELECT s.*, COUNT(m.id) as message_count FROM sessions s LEFT JOIN messages m ON s.id = m.session_id WHERE s.user_id = ? GROUP BY s.id ORDER BY s.pinned DESC, s.updated_at DESC",
            (current_user["id"],)
        )
    rows = cursor.fetchall()
    conn.close()

    sessions = []
    for row in rows:
        sessions.append({
            "id": row["id"],
            "title": row["title"],
            "system_prompt": row["system_prompt"],
            "temperature": row["temperature"],
            "mode": row["mode"],
            "domain_id": row["domain_id"],
            "pinned": bool(row["pinned"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "message_count": row["message_count"]
        })

    return success(sessions)


@router.get("/{session_id}", response_model=ApiResponse)
async def get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    session = _check_session_owner(session_id, current_user["id"])
    return success(session)


@router.put("/{session_id}", response_model=ApiResponse)
async def update_session(session_id: str, data: SessionUpdate, current_user: dict = Depends(get_current_user)):
    _check_session_owner(session_id, current_user["id"])

    conn = get_connection()
    cursor = conn.cursor()

    updates = []
    params = []
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.system_prompt is not None:
        updates.append("system_prompt = ?")
        params.append(data.system_prompt)
    if data.temperature is not None:
        updates.append("temperature = ?")
        params.append(data.temperature)
    if data.pinned is not None:
        updates.append("pinned = ?")
        params.append(1 if data.pinned else 0)

    if not updates:
        return success()

    updates.append("updated_at = ?")
    params.append(datetime.utcnow().isoformat())
    params.append(session_id)

    cursor.execute(
        f"UPDATE sessions SET {', '.join(updates)} WHERE id = ?",
        params
    )
    conn.commit()
    conn.close()

    return success()


@router.delete("/{session_id}", response_model=ApiResponse)
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    _check_session_owner(session_id, current_user["id"])

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()

    return success()


@router.get("/{session_id}/messages", response_model=ApiResponse)
async def get_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    _check_session_owner(session_id, current_user["id"])

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,)
    )
    rows = cursor.fetchall()
    conn.close()

    messages = []
    for row in rows:
        msg = dict(row)
        if msg.get("tool_calls"):
            import json
            try:
                msg["tool_calls"] = json.loads(msg["tool_calls"])
            except:
                pass
        messages.append(msg)

    return success(messages)
