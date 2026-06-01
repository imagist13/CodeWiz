from __future__ import annotations

"""SQLite database connection and session management."""
import os
import aiosqlite
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from core.models import Base

from paths import get_data_dir

_DB_PATH = os.path.join(get_data_dir(), 'hermes.db')
_ENGINE = None
_SessionLocal = None


def get_db_path() -> str:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    return _DB_PATH


def get_engine():
    global _ENGINE, _SessionLocal
    if _ENGINE is None:
        db_path = get_db_path()
        # Use aiosqlite for async access
        _ENGINE = create_async_engine(
            f'sqlite+aiosqlite:///{db_path}',
            connect_args={'check_same_thread': False},
            poolclass=StaticPool,
            echo=False
        )
        _SessionLocal = async_sessionmaker(
            _ENGINE,
            class_=AsyncSession,
            expire_on_commit=False
        )
    return _ENGINE


def get_session_factory():
    if _SessionLocal is None:
        get_engine()
    return _SessionLocal


async def init_db() -> None:
    """Create all tables if they don't exist."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for FastAPI routes."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_sync_db():
    """Synchronous context for use outside of async context (e.g. cron)."""
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db
