"""
Main FastAPI application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api import chat, conversation, auth, sandbox
from app.core.database import engine, Base

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="AI Service for Adorable",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(conversation.router)
app.include_router(sandbox.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.app_name}


@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
