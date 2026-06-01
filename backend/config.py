"""配置加载"""
import os
from pathlib import Path
from typing import Any
from dotenv import load_dotenv

load_dotenv()


def get_project_root() -> Path:
    """项目根目录"""
    return Path(__file__).resolve().parent.parent.parent


def get_conduit_repo_path() -> str:
    """Conduit 仓库路径"""
    return os.environ.get("CONDUIT_REPO_PATH", str(get_project_root() / "conduit-repo"))


def get_storage_path() -> str:
    """存储路径"""
    return os.environ.get("STORAGE_PATH", str(get_project_root() / "storage"))


def get_doubao_config() -> dict[str, Any]:
    """豆包 EP 配置"""
    return {
        "api_key": os.environ.get("DOUBAO_API_KEY", ""),
        "base_url": os.environ.get(
            "DOUBAO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"
        ),
        "model": os.environ.get("DOUBAO_MODEL", "doubao-seed-2.0-lite"),
    }


def get_app_config() -> dict[str, Any]:
    """应用配置"""
    return {
        "host": os.environ.get("HOST", "127.0.0.1"),
        "port": int(os.environ.get("PORT", "8000")),
        "debug": os.environ.get("DEBUG", "false").lower() == "true",
        "cors_origins": os.environ.get("CORS_ORIGINS", "*").split(","),
    }


def ensure_dirs() -> None:
    """确保必要目录存在"""
    root = get_project_root()
    for d in [
        get_storage_path(),
        root / "storage" / "sessions",
        root / "storage" / "checkpoints",
        root / "storage" / "events",
        root / "storage" / "memory",
        root / "storage" / "archive",
    ]:
        Path(d).mkdir(parents=True, exist_ok=True)
