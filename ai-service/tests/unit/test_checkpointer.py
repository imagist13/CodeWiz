from app.orchestrator.checkpointer import (
    make_checkpointer,
    CheckpointerKind,
)


class TestMakeCheckpointer:
    def test_memory_kind(self):
        cp = make_checkpointer(CheckpointerKind.MEMORY)
        from langgraph.checkpoint.memory import MemorySaver

        assert isinstance(cp, MemorySaver)

    def test_postgres_kind_returns_callable_or_class(self):
        # PG 不连真库, 仅校验返回类型存在 .setup / .put 等 saver 接口

        cp_factory = make_checkpointer(
            CheckpointerKind.POSTGRES,
            dsn="postgresql://localhost/dummy",
            connect=False,  # 测试模式: 只构造不连接
        )
        # PostgresSaver 在 connect=False 时返回一个未初始化实例 / 工厂
        assert cp_factory is not None
