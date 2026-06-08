from pydantic_settings import BaseSettings
from pathlib import Path


ROOT_DIR = Path(__file__).parent.parent.parent.parent
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    minimax_api_key: str = ""
    minimax_base_url: str = "https://api.minimax.chat/v1"
    minimax_model: str = "MiniMax-M2.5"
    minimax_timeout: int = 60

    agent_max_tool_rounds: int = 4

    default_models_enabled: str = "{}"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    wecom_secret_key: str = ""

    database_url: str = "sqlite:///./data/harness.db"

    # Milvus
    milvus_host: str = ""
    milvus_port: int = 19530

    # Bailian (Aliyun)
    bailian_api_key: str = ""
    bailian_embedding_model: str = "text-embedding-v4"
    bailian_rerank_model: str = "qwen3-vl-rerank"
    bailian_embedding_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    bailian_rerank_url: str = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank"
    bailian_embedding_dim: int = 1536

    @property
    def agent_md_path(self) -> str:
        # Support both local dev (backend/AGENT.md) and container (/app/AGENT.md)
        candidates = [
            ROOT_DIR / "AGENT.md",
            ROOT_DIR / "backend" / "AGENT.md",
        ]
        for c in candidates:
            if c.exists():
                return str(c)
        return str(candidates[0])  # fallback to first for clear error message

    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"


_env_settings = Settings()


def _overlay_custom_models(user_id: str, overrides: dict) -> dict:
    """If a custom model of a given type is enabled, overlay its fields onto
    the corresponding default keys so backend services (llm.py, bailian_client.py)
    pick it up automatically."""
    try:
        from app.services.settings_service import get_setting as db_get_setting
        import json

        raw = db_get_setting(user_id, "custom_models")
        if not raw:
            return overrides
        models = json.loads(raw)
        if not isinstance(models, list):
            return overrides

        for m in models:
            if not isinstance(m, dict) or not m.get("enabled"):
                continue
            t = m.get("type")
            if t == "llm":
                overrides["minimax_api_key"] = m.get("api_key", "")
                overrides["minimax_base_url"] = m.get("base_url", "")
                overrides["minimax_model"] = m.get("model", "")
                overrides["minimax_timeout"] = m.get("timeout", "60")
            elif t == "embedding":
                overrides["bailian_api_key"] = m.get("api_key", "")
                overrides["bailian_embedding_url"] = m.get("base_url", "")
                overrides["bailian_embedding_model"] = m.get("model", "")
                overrides["bailian_embedding_dim"] = m.get("dimension", "1536")
            elif t == "rerank":
                overrides["bailian_rerank_api_key"] = m.get("api_key", "")
                overrides["bailian_rerank_url"] = m.get("base_url", "")
                overrides["bailian_rerank_model"] = m.get("model", "")
    except Exception:
        pass
    return overrides


def get_settings(user_id: str = None) -> Settings:
    """Return settings, preferring database overrides over environment variables.
    If user_id is provided, overlay that user's database settings on top of env defaults.
    Enabled custom models take precedence over default model keys.
    """
    if user_id:
        try:
            from app.services.settings_service import get_setting as db_get_setting

            overrides = {}
            for key in [
                "minimax_api_key",
                "minimax_base_url",
                "minimax_model",
                "minimax_timeout",
                "milvus_host",
                "milvus_port",
                "bailian_api_key",
                "bailian_embedding_model",
                "bailian_rerank_model",
                "bailian_embedding_url",
                "bailian_rerank_url",
                "bailian_embedding_dim",
                "agent_max_tool_rounds",
                "wecom_secret_key",
                "default_models_enabled",
            ]:
                val = db_get_setting(user_id, key)
                if val is not None and val != "":
                    overrides[key] = val

            overrides = _overlay_custom_models(user_id, overrides)

            if overrides:
                return Settings(**{**_env_settings.model_dump(), **overrides})
        except Exception:
            pass
    return _env_settings
