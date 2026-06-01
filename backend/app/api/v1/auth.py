import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
import re

from app.core.auth import hash_password, verify_password, create_access_token
from app.core.response import success, ApiResponse
from app.db.database import get_connection
from app.services.settings_service import initialize_settings_from_env

router = APIRouter()

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
PHONE_RE = re.compile(r"^\d{6,15}$")


class RegisterRequest(BaseModel):
    email: str | None = None
    phone: str | None = None
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v and not EMAIL_RE.match(v):
            raise ValueError("邮箱格式不正确")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v and not PHONE_RE.match(v):
            raise ValueError("手机号格式不正确")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("密码至少需要6个字符")
        return v


class LoginRequest(BaseModel):
    email: str | None = None
    phone: str | None = None
    password: str


def _find_user_by_identity(email: str | None, phone: str | None) -> dict | None:
    conn = get_connection()
    cursor = conn.cursor()
    if email:
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    elif phone:
        cursor.execute("SELECT * FROM users WHERE phone = ?", (phone,))
    else:
        conn.close()
        return None
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def _user_response(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user.get("email"),
        "phone": user.get("phone"),
        "created_at": user.get("created_at"),
    }


@router.post("/register", response_model=ApiResponse)
async def register(data: RegisterRequest):
    if not data.email and not data.phone:
        raise HTTPException(status_code=422, detail="请提供邮箱或手机号")

    existing = _find_user_by_identity(data.email, data.phone)
    if existing:
        if data.email and existing.get("email") == data.email:
            raise HTTPException(status_code=409, detail="该邮箱已注册")
        if data.phone and existing.get("phone") == data.phone:
            raise HTTPException(status_code=409, detail="该手机号已注册")

    user_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    hashed = hash_password(data.password)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (id, email, phone, hashed_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, data.email, data.phone, hashed, now, now),
    )
    conn.commit()
    conn.close()

    # Seed default settings from env for the new user
    initialize_settings_from_env(user_id)

    token = create_access_token(user_id)
    return success({
        "token": token,
        "user": _user_response({"id": user_id, "email": data.email, "phone": data.phone, "created_at": now}),
    })


@router.post("/login", response_model=ApiResponse)
async def login(data: LoginRequest):
    if not data.email and not data.phone:
        raise HTTPException(status_code=422, detail="请提供邮箱或手机号")

    user = _find_user_by_identity(data.email, data.phone)
    if not user or not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="邮箱/手机号或密码错误")

    token = create_access_token(user["id"])
    return success({
        "token": token,
        "user": _user_response(user),
    })
