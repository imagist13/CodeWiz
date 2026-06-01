from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.response import success
from app.core.security import get_current_user
from app.db.database import delete_wecom_config
from app.services.wecom_binding import (
    encrypt_secret,
    get_binding_status,
)
from app.services.wecom_ws import wecom_ws_manager

router = APIRouter()


class BindRequestDirect(BaseModel):
    bot_id: str
    secret: str


@router.get("/bind")
async def get_bind_info(current_user: dict = Depends(get_current_user)):
    return success(get_binding_status(current_user["id"]))


@router.post("/bind")
async def submit_bind_direct(request: BindRequestDirect, current_user: dict = Depends(get_current_user)):
    from app.db.database import set_wecom_config
    try:
        set_wecom_config(current_user["id"], request.bot_id, encrypt_secret(request.secret))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"服务器配置错误：{e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败：{e}")

    connected = await wecom_ws_manager.start(current_user["id"])
    if not connected:
        raise HTTPException(status_code=400, detail="凭据已保存，但无法连接到企业微信服务器，请检查 Bot ID 和 Secret 是否正确")

    return success({"bound": True})


@router.delete("/bind")
async def unbind(current_user: dict = Depends(get_current_user)):
    wecom_ws_manager.stop(current_user["id"])
    delete_wecom_config(current_user["id"])
    return success({"unbound": True})
