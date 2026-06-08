from typing import Optional
from app.db.database import get_system_setting, set_system_setting, get_all_system_settings
from app.core.config import Settings

# Runtime config cache: {user_id: {key: value}}
_config_cache: dict = {}

SETTING_KEYS = [
    "milvus_host",
    "milvus_port",
    "minimax_api_key",
    "minimax_base_url",
    "minimax_model",
    "minimax_timeout",
    "bailian_api_key",
    "bailian_rerank_api_key",
    "bailian_embedding_model",
    "bailian_rerank_model",
    "bailian_embedding_url",
    "bailian_rerank_url",
    "bailian_embedding_dim",
    "custom_models",
    "default_models_enabled",
    "agent_max_tool_rounds",
    "wecom_secret_key",
]


def _ensure_cache(user_id: str) -> dict:
    if user_id not in _config_cache:
        _config_cache[user_id] = {}
    return _config_cache[user_id]


def initialize_settings_from_env(user_id: str = None):
    """Seed database with environment variable values if system_settings is empty for user."""
    if user_id is None:
        return
    existing = get_all_system_settings(user_id)
    cache = _ensure_cache(user_id)
    if existing:
        cache.update(existing)
        return

    env_settings = Settings()
    for key in SETTING_KEYS:
        value = getattr(env_settings, key, "")
        if value is not None and value != "":
            str_value = str(value)
            set_system_setting(user_id, key, str_value)
            cache[key] = str_value

    if not get_system_setting(user_id, "bailian_rerank_api_key"):
        bailian_key = getattr(env_settings, "bailian_api_key", "")
        if bailian_key:
            set_system_setting(user_id, "bailian_rerank_api_key", str(bailian_key))
            cache["bailian_rerank_api_key"] = str(bailian_key)


def get_setting(user_id: str, key: str) -> Optional[str]:
    """Get setting from cache, falling back to database."""
    cache = _ensure_cache(user_id)
    if key in cache:
        return cache[key]
    value = get_system_setting(user_id, key)
    if value is not None:
        cache[key] = value
    return value


def set_setting(user_id: str, key: str, value: str) -> None:
    """Persist setting to database and update cache."""
    set_system_setting(user_id, key, value)
    _ensure_cache(user_id)[key] = value


def get_all_settings(user_id: str) -> dict:
    """Get all settings, refreshing cache from database."""
    settings = get_all_system_settings(user_id)
    cache = _ensure_cache(user_id)
    cache.update(settings)
    return dict(cache)


def update_settings(user_id: str, updates: dict) -> dict:
    """Update multiple settings at once."""
    for key, value in updates.items():
        if key in SETTING_KEYS:
            set_setting(user_id, key, str(value))
    return get_all_settings(user_id)


def get_system_status(user_id: str) -> dict:
    """Return whether Milvus and models are configured."""
    milvus_host = get_setting(user_id, "milvus_host") or ""
    milvus_port = get_setting(user_id, "milvus_port") or ""
    milvus_configured = bool(milvus_host.strip() and milvus_port.strip())

    # Check if any enabled custom model provides the required keys
    llm_key = get_setting(user_id, "minimax_api_key") or ""
    emb_key = get_setting(user_id, "bailian_api_key") or ""
    try:
        import json
        raw = get_setting(user_id, "custom_models") or ""
        models = json.loads(raw) if raw else []
        for m in models:
            if not isinstance(m, dict) or not m.get("enabled"):
                continue
            t = m.get("type")
            if t == "llm" and m.get("api_key"):
                llm_key = m["api_key"]
            elif t == "embedding" and m.get("api_key"):
                emb_key = m["api_key"]
    except Exception:
        pass

    models_configured = bool(llm_key.strip() and emb_key.strip())

    return {
        "milvus_configured": milvus_configured,
        "models_configured": models_configured,
    }


def get_enabled_models(user_id: str) -> dict:
    """Return which model types have an enabled model with non-empty API key.
    Returns {"llm": bool, "embedding": bool, "rerank": bool}
    """
    import json
    result = {"llm": False, "embedding": False, "rerank": False}

    # Check default models
    default_enabled_raw = get_setting(user_id, "default_models_enabled") or "{}"
    try:
        default_enabled = json.loads(default_enabled_raw)
    except Exception:
        default_enabled = {}

    if default_enabled.get("llm"):
        llm_key = get_setting(user_id, "minimax_api_key") or ""
        if llm_key.strip():
            result["llm"] = True

    if default_enabled.get("embedding"):
        emb_key = get_setting(user_id, "bailian_api_key") or ""
        if emb_key.strip():
            result["embedding"] = True

    if default_enabled.get("rerank"):
        rerank_key = get_setting(user_id, "bailian_rerank_api_key") or ""
        if not rerank_key.strip():
            rerank_key = get_setting(user_id, "bailian_api_key") or ""
        if rerank_key.strip():
            result["rerank"] = True

    # Check custom models
    raw = get_setting(user_id, "custom_models") or ""
    try:
        models = json.loads(raw) if raw else []
        for m in models:
            if not isinstance(m, dict) or not m.get("enabled"):
                continue
            t = m.get("type")
            if t == "llm" and m.get("api_key"):
                result["llm"] = True
            elif t == "embedding" and m.get("api_key"):
                result["embedding"] = True
            elif t == "rerank" and m.get("api_key"):
                result["rerank"] = True
    except Exception:
        pass

    return result


def test_model_connection(model_type: str, overrides: dict = None, user_id: str = None) -> dict:
    """Test model connectivity. Returns {success: bool, message: str}."""
    overrides = overrides or {}

    if model_type == "llm":
        api_key = overrides.get("api_key") or (get_setting(user_id, "minimax_api_key") if user_id else "") or ""
        base_url = overrides.get("base_url") or (get_setting(user_id, "minimax_base_url") if user_id else "") or ""
        model = overrides.get("model") or (get_setting(user_id, "minimax_model") if user_id else "") or ""
        if not api_key.strip():
            return {"success": False, "message": "API Key 不能为空"}
        try:
            import requests
            resp = requests.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
                timeout=10,
            )
            if resp.status_code == 200:
                return {"success": True, "message": "连接成功"}
            else:
                return {"success": False, "message": f"请求失败: HTTP {resp.status_code}"}
        except Exception as e:
            return {"success": False, "message": f"连接失败: {str(e)}"}

    elif model_type == "embedding":
        api_key = overrides.get("api_key") or (get_setting(user_id, "bailian_api_key") if user_id else "") or ""
        base_url = overrides.get("base_url") or (get_setting(user_id, "bailian_embedding_url") if user_id else "") or ""
        model = overrides.get("model") or (get_setting(user_id, "bailian_embedding_model") if user_id else "") or ""
        if not api_key.strip():
            return {"success": False, "message": "API Key 不能为空"}
        try:
            import requests
            resp = requests.post(
                f"{base_url.rstrip('/')}/embeddings",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "input": ["test"]},
                timeout=10,
            )
            if resp.status_code == 200:
                return {"success": True, "message": "连接成功"}
            else:
                return {"success": False, "message": f"请求失败: HTTP {resp.status_code}"}
        except Exception as e:
            return {"success": False, "message": f"连接失败: {str(e)}"}

    elif model_type == "rerank":
        api_key = overrides.get("api_key") or (get_setting(user_id, "bailian_rerank_api_key") if user_id else "") or (get_setting(user_id, "bailian_api_key") if user_id else "") or ""
        base_url = overrides.get("base_url") or (get_setting(user_id, "bailian_rerank_url") if user_id else "") or ""
        model = overrides.get("model") or (get_setting(user_id, "bailian_rerank_model") if user_id else "") or ""
        if not api_key.strip():
            return {"success": False, "message": "API Key 不能为空"}
        try:
            import requests
            resp = requests.post(
                base_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "input": {
                        "query": {"text": "test"},
                        "documents": [{"text": "hello"}],
                    },
                    "parameters": {"top_n": 1, "return_documents": True},
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return {"success": True, "message": "连接成功"}
            else:
                return {"success": False, "message": f"请求失败: HTTP {resp.status_code}"}
        except Exception as e:
            return {"success": False, "message": f"连接失败: {str(e)}"}

    return {"success": False, "message": f"不支持的模型类型: {model_type}"}
