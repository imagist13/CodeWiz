"""LangGraph checkpoint saver 工厂。

两种实现:
  - MEMORY: 单元测试用, langgraph.checkpoint.memory.MemorySaver, 进程内
  - POSTGRES: 生产, langgraph.checkpoint.postgres.PostgresSaver

PostgresSaver 第一次跑必须先 .setup() 建表 (checkpoints, checkpoint_blobs,
checkpoint_writes 三表)。在 main.py 的应用启动钩子里调一次。
"""

from enum import Enum
from typing import Optional, Any


class CheckpointerKind(str, Enum):
    MEMORY = "memory"
    POSTGRES = "postgres"


def make_checkpointer(
    kind: CheckpointerKind,
    *,
    dsn: Optional[str] = None,
    connect: bool = True,
) -> Any:
    if kind == CheckpointerKind.MEMORY:
        from langgraph.checkpoint.memory import MemorySaver

        return MemorySaver()

    if kind == CheckpointerKind.POSTGRES:
        if not dsn:
            raise ValueError("POSTGRES checkpointer requires dsn=")
        from langgraph.checkpoint.postgres import PostgresSaver

        if not connect:
            # 测试模式: 返回类本身, 实际使用时 caller 再 .from_conn_string 连接
            return PostgresSaver
        return PostgresSaver.from_conn_string(dsn)

    raise ValueError(f"unknown checkpointer kind: {kind}")
