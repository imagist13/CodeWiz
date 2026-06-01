"""FastAPI 应用实例"""

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pathlib import Path

from config import get_app_config, ensure_dirs, get_storage_path
from skills import register_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时
    ensure_dirs()
    register_all()
    yield
    # 关闭时（可扩展清理逻辑）


def create_app() -> FastAPI:
    cfg = get_app_config()

    app = FastAPI(
        title="SuperAgent",
        description="端到端交付全栈项目的超级个体 AI Agent",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg["cors_origins"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 注册路由
    from api import register_routes
    register_routes(app)

    # 前端静态文件
    frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
    if frontend_dist.exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/")
    async def root():
        index = frontend_dist / "index.html"
        if index.exists():
            return HTMLResponse(index.read_text(encoding="utf-8"))
        return {"message": "SuperAgent API", "version": "0.1.0"}

    return app
