"""原子写工具 — 防止写文件时断电导致半写入"""

import os
import tempfile
from pathlib import Path


def atomic_write(path: str | Path, content: str, encoding: str = "utf-8") -> None:
    """原子写入文本文件（先写 tmp 再 rename）"""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=f".tmp-{path.name}-",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(content)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def atomic_write_json(path: str | Path, data: dict) -> None:
    """原子写入 JSON 文件"""
    import json
    atomic_write(path, json.dumps(data, ensure_ascii=False, indent=2))
