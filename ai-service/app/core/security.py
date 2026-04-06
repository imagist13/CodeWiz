"""
鉴权：一律走 Go 后端 /auth/me，避免本地 jose 解码与 golang-jwt 签发细节不一致导致 Invalid token。
"""
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config import get_settings

settings = get_settings()
security = HTTPBearer()


async def validate_token_via_backend(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                f"{settings.backend_url.rstrip('/')}/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Backend service unavailable",
            )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    body = resp.json()
    if body.get("code") != 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    data = body.get("data")
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    return data


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    return await validate_token_via_backend(credentials.credentials)
