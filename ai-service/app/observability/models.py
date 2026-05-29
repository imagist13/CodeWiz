"""LLMCall 表：每次 LLM 调用都落库, 喂 /metrics 仪表盘。

DB schema 设计在 spec §3.7。这里独立用一个 Base 避免与现有 app.models.database 冲突,
集成时 Base.metadata 会合并进主 engine。
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    BigInteger,
    String,
    Integer,
    Numeric,
    DateTime,
    Text,
    Index,
)
from sqlalchemy.orm import declarative_base


Base = declarative_base()


class LLMCall(Base):
    __tablename__ = "llm_calls"

    id = Column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    session_id = Column(String(64), nullable=False)
    step_id = Column(String(64), nullable=True)
    skill_name = Column(String(64), nullable=True)
    prompt_key = Column(String(64), nullable=True)
    tokens_in = Column(Integer, nullable=False, default=0)
    tokens_out = Column(Integer, nullable=False, default=0)
    latency_ms = Column(Integer, nullable=False, default=0)
    cost_cny = Column(Numeric(10, 6), nullable=False, default=0)
    model = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False, default="ok")  # ok | error
    error_msg = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (Index("idx_llm_calls_session", "session_id", "created_at"),)
