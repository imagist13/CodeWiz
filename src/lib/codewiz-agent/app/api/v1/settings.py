from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from app.core.response import success
from app.core.security import get_current_user
from app.services.settings_service import (
    get_all_settings,
    update_settings,
    get_system_status,
    get_setting,
    test_model_connection,
)

router = APIRouter()


class SettingsUpdateRequest(BaseModel):
    milvus_host: str | None = None
    milvus_port: str | None = None
    minimax_api_key: str | None = None
    minimax_base_url: str | None = None
    minimax_model: str | None = None
    minimax_timeout: str | None = None
    bailian_api_key: str | None = None
    bailian_rerank_api_key: str | None = None
    bailian_embedding_model: str | None = None
    bailian_rerank_model: str | None = None
    bailian_embedding_url: str | None = None
    bailian_rerank_url: str | None = None
    bailian_embedding_dim: str | None = None
    custom_models: str | None = None
    default_models_enabled: str | None = None


class MilvusTestRequest(BaseModel):
    host: str | None = None
    port: str | None = None


class ModelTestRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_type: str  # "llm" | "embedding" | "rerank"
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


@router.get("")
async def get_settings(current_user: dict = Depends(get_current_user)):
    settings = get_all_settings(current_user["id"])
    import json
    custom_models_raw = settings.get("custom_models", "")
    try:
        custom_models = json.loads(custom_models_raw) if custom_models_raw else []
    except Exception:
        custom_models = []

    default_models_enabled_raw = settings.get("default_models_enabled", "")
    try:
        default_models_enabled = json.loads(default_models_enabled_raw) if default_models_enabled_raw else {}
    except Exception:
        default_models_enabled = {}

    return success({
        "milvus": {
            "host": settings.get("milvus_host", ""),
            "port": settings.get("milvus_port", ""),
        },
        "models": {
            "llm": {
                "api_key": settings.get("minimax_api_key", ""),
                "base_url": settings.get("minimax_base_url", ""),
                "model": settings.get("minimax_model", ""),
                "timeout": settings.get("minimax_timeout", ""),
            },
            "embedding": {
                "api_key": settings.get("bailian_api_key", ""),
                "base_url": settings.get("bailian_embedding_url", ""),
                "model": settings.get("bailian_embedding_model", ""),
                "dimension": settings.get("bailian_embedding_dim", ""),
            },
            "rerank": {
                "api_key": settings.get("bailian_rerank_api_key", settings.get("bailian_api_key", "")),
                "base_url": settings.get("bailian_rerank_url", ""),
                "model": settings.get("bailian_rerank_model", ""),
            },
        },
        "custom_models": custom_models,
        "default_models_enabled": default_models_enabled,
    })


@router.post("")
async def update_system_settings(request: SettingsUpdateRequest, current_user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    updated = update_settings(current_user["id"], updates)
    return success(updated)


@router.get("/system-status")
async def system_status(current_user: dict = Depends(get_current_user)):
    return success(get_system_status(current_user["id"]))


@router.post("/test-milvus")
async def test_milvus(request: MilvusTestRequest, current_user: dict = Depends(get_current_user)):
    host = request.host or get_setting(current_user["id"], "milvus_host") or ""
    port = request.port or get_setting(current_user["id"], "milvus_port") or ""

    if not host.strip() or not port.strip():
        raise HTTPException(status_code=400, detail="Milvus host 和 port 未配置")

    try:
        from pymilvus import connections
        connections.connect(alias="test_conn", host=host.strip(), port=port.strip())
        connections.disconnect("test_conn")
        return success({"success": True, "message": "连接成功"})
    except Exception as e:
        return success({"success": False, "message": f"连接失败: {str(e)}"})


@router.post("/test-model")
async def test_model(request: ModelTestRequest, current_user: dict = Depends(get_current_user)):
    if request.model_type not in ("llm", "embedding", "rerank"):
        raise HTTPException(status_code=400, detail="model_type 必须是 llm / embedding / rerank")
    result = test_model_connection(
        request.model_type,
        {
            "api_key": request.api_key,
            "base_url": request.base_url,
            "model": request.model,
        },
        user_id=current_user["id"],
    )
    return success(result)
