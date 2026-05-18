from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# app/core/config.py -> ai-service/
_AI_SERVICE_ROOT = Path(__file__).resolve().parents[2]
# 上一级（本地仓库里多为 Adorable/）；Docker 里可能不存在，只加载存在的文件
_PROJECT_ROOT = Path(__file__).resolve().parents[3]

_ENV_FILE_CANDIDATES = (
    _AI_SERVICE_ROOT / ".env",
    _PROJECT_ROOT / ".env",
)
# Load dotenv at module import time so os.environ gets JWT_SECRET before Settings reads it
for _env_path in _ENV_FILE_CANDIDATES:
    if _env_path.is_file():
        load_dotenv(_env_path, override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        extra="allow",
    )

    app_name: str = "CodeWiz AI Service"
    debug: bool = False

    # Database — 支持 SQLAlchemy URL（postgresql://...）和 libpq 格式（host=... port=...）
    # .env 里写 DATABASE_URL=host=localhost user=postgres password=postgres dbname=codewiz port=5432 sslmode=disable
    # 也可以直接写 postgresql://postgres:postgres@localhost:5432/codewiz
    database_url: str = "postgresql://postgres:postgres@localhost:5432/codewiz"

    @model_validator(mode="after")
    def _fix_database_url(self):
        url = self.database_url or ""
        # libpq 格式：host=xxx user=xxx ...
        if url.startswith("host=") or ("=" in url and "://" not in url):
            parts = {}
            for segment in url.split():
                if "=" in segment:
                    key, val = segment.split("=", 1)
                    parts[key] = val
            self.database_url = (
                f"postgresql://{parts.get('user', 'postgres')}:"
                f"{parts.get('password', 'postgres')}@"
                f"{parts.get('host', 'localhost')}:"
                f"{parts.get('port', '5432')}/"
                f"{parts.get('dbname', 'codewiz')}"
                f"?sslmode={parts.get('sslmode', 'disable')}"
            )
        return self

    # JWT (must match Go backend JWT_SECRET)
    jwt_secret: str = "codewiz-dev-secret-change-in-prod"

    # Go backend URL (for token validation)
    backend_url: str = "http://localhost:8080"

    # LLM Provider — 支持: silicon_flow / openai / deepseek / zhipu / openai_compatible
    # 切换 provider 时只需改此项，其余 url/key 沿用已有字段
    llm_provider: str = "silicon_flow"

    # LLM API Key — 通用字段，切换 provider 时改此项即可
    # 向后兼容：为空时回退到 silicon_flow_api_key
    llm_api_key: str = ""

    # Silicon Flow — ChatOpenAI 需要 OpenAI 风格 base（含 /v1），内部会再拼 /chat/completions
    silicon_flow_api_url: str = "https://api.siliconflow.cn/v1"
    silicon_flow_api_key: str = ""

    # LLM Model
    llm_model: str = "Qwen/Qwen2.5-7B-Instruct"

    # File storage
    upload_dir: str = "./uploads"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
