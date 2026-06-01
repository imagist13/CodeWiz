from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.db.database import init_db
from app.core.exceptions import HarnessException, harness_exception_handler, general_exception_handler
from app.api.v1 import auth, sessions, tools, chat, wecom, rag, settings, skills
from app.services.wecom_ws import wecom_ws_manager
from app.skills.manager import skill_manager
from app.services.rag.milvus_client import init_milvus_collection
from app.services.settings_service import initialize_settings_from_env
from app.tools import file_reader  # noqa: F401 — registers read_local_file tool
from app.tools import skill_loader  # noqa: F401 — registers load_skill tool


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        init_milvus_collection()
        print("[RAG] Milvus collection initialized")
    except Exception as e:
        print(f"[RAG] Milvus init warning: {e}")
    skill_manager.discover()
    count = await wecom_ws_manager.start_all()
    if count > 0:
        print(f"[WeCom] WebSocket bot connected for {count} user(s)")
    yield
    wecom_ws_manager.stop()


app = FastAPI(
    title="Yszen AI",
    description="Yszen AI - Intelligent Agent Platform",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Bind-Token"],
)

app.add_exception_handler(HarnessException, harness_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(tools.router, prefix="/api/tools", tags=["tools"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(wecom.router, prefix="/api/wecom", tags=["wecom"])
app.include_router(rag.router, prefix="/api/rag", tags=["rag"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])


@app.get("/")
async def root():
    return {"message": "Yszen AI API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
