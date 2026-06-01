from typing import Any, Optional
from pydantic import BaseModel


class ApiResponse(BaseModel):
    code: int = 200
    message: str = "success"
    data: Optional[Any] = None


def success(data: Any = None, message: str = "success") -> ApiResponse:
    return ApiResponse(code=200, message=message, data=data)


def error(message: str = "error", code: int = 500, data: Any = None) -> ApiResponse:
    return ApiResponse(code=code, message=message, data=data)
