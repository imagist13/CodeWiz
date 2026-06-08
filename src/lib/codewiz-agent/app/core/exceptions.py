from fastapi import Request
from fastapi.responses import JSONResponse
from app.core.response import error


class HarnessException(Exception):
    def __init__(self, message: str, code: int = 500):
        self.message = message
        self.code = code
        super().__init__(message)


async def harness_exception_handler(request: Request, exc: HarnessException):
    return JSONResponse(
        status_code=exc.code,
        content=error(message=exc.message, code=exc.code).model_dump()
    )


async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=error(message=str(exc), code=500).model_dump()
    )
