"""API 路由层统一注册"""

from fastapi import FastAPI

from api import session, chat, clarify, plan, verify, commit, context, observability


def register_routes(app: FastAPI):
    app.include_router(session.router, prefix="/api", tags=["session"])
    app.include_router(chat.router, prefix="/api", tags=["chat"])
    app.include_router(clarify.router, prefix="/api", tags=["clarify"])
    app.include_router(plan.router, prefix="/api", tags=["plan"])
    app.include_router(verify.router, prefix="/api", tags=["verify"])
    app.include_router(commit.router, prefix="/api", tags=["commit"])
    app.include_router(context.router, prefix="/api", tags=["context"])
    app.include_router(observability.router, prefix="/api", tags=["observability"])
