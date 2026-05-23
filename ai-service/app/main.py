"""
Main FastAPI application — AI Worker: only streaming chat + tools.
All data/auth is handled by the Go backend.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api import chat
from app.core.database import engine, Base

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="AI Service for CodeWiz — streaming chat only",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.app_name}


@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
