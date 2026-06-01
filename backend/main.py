from __future__ import annotations

"""Hermes FastAPI application entry point."""
import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from paths import get_project_root
from core.database import init_db

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s'
)
log = logging.getLogger(__name__)


def _register_all_tools() -> None:
    _log = logging.getLogger(__name__)
    from runcore.tools.registry import get_registry
    from runcore.tools.file_ops import FileOpsTool
    from runcore.tools.search import SearchTool
    from runcore.tools.codemap_tool import ScanRepoTool

    registry = get_registry()
    registry.register(FileOpsTool())
    registry.register(SearchTool())
    registry.register(ScanRepoTool())
    _log.info("Registered new tools: file_ops, search, scan_repo")

    # Legacy tools — registered explicitly so import order is controlled.
    # The @register_tool decorator in skills/ still works because it uses
    # get_registry() which returns the singleton initialized here.
    from runcore.tools.legacy_tools import register_all_legacy_tools
    register_all_legacy_tools()

    _log.info(f"Total tools registered: {len(registry.list_tools())}")


# Import skills (triggers @register_tool decorators in each skill's tool.py)
from skills import load_skills
load_skills()

# Register all tools before lifespan (so they are available at startup)
_register_all_tools()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info('Hermes backend starting...')

    await init_db()
    log.info('Database initialized')

    yield

    log.info('Hermes backend shutting down...')
    from runcore.tools.pool import shutdown_tool_runner
    shutdown_tool_runner()


app = FastAPI(
    title='Hermes API',
    version='1.0.0',
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/api/health')
async def health():
    return {'status': 'ok', 'service': 'hermes'}


# Import and register routes
from api import chat, users, conversations, tasks, config, files

app.include_router(chat.router, prefix='/api')
app.include_router(users.router, prefix='/api')
app.include_router(conversations.router, prefix='/api')
app.include_router(tasks.router, prefix='/api')
app.include_router(config.router, prefix='/api')
app.include_router(files.router, prefix='/api')

# Serve frontend dist in production
_root = get_project_root()
dist_dir = os.path.join(_root, 'dist', 'renderer')
if os.path.exists(dist_dir):
    app.mount('/static', StaticFiles(directory=dist_dir, html=True), '')

    @app.get('/')
    async def root():
        return FileResponse(os.path.join(dist_dir, 'index.html'))


def run():
    port = int(os.environ.get('HERMES_PORT', os.environ.get('PORT', '1478')))
    host = os.environ.get('HERMES_HOST', '127.0.0.1')
    log.info(f'Starting Hermes API on {host}:{port}')
    uvicorn.run(app, host=host, port=port, log_level='info')


if __name__ == '__main__':
    run()
