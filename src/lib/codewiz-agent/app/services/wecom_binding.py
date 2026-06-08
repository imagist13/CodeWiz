from cryptography.fernet import Fernet

from app.db.database import get_wecom_config
from app.core.config import get_settings


def get_fernet() -> Fernet:
    key = get_settings().wecom_secret_key
    if not key:
        raise RuntimeError("WECOM_SECRET_KEY is not set")
    key_bytes = key.encode()
    if len(key_bytes) < 32:
        key_bytes = key_bytes.ljust(32, b"0")
    import base64
    fernet_key = base64.urlsafe_b64encode(key_bytes[:32])
    return Fernet(fernet_key)


def encrypt_secret(secret: str) -> str:
    return get_fernet().encrypt(secret.encode()).decode()


def decrypt_secret(encrypted: str) -> str:
    return get_fernet().decrypt(encrypted.encode()).decode()


def get_binding_status(user_id: str) -> dict:
    cfg = get_wecom_config(user_id)
    if not cfg or not cfg.get("bot_id"):
        return {"bound": False}
    return {
        "bound": True,
        "bot_id": cfg["bot_id"][:4] + "****" + cfg["bot_id"][-4:] if len(cfg["bot_id"]) > 8 else "****",
        "bound_at": cfg.get("bound_at"),
    }
