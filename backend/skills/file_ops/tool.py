"""file_ops — 文件读写与搜索工具"""

from pathlib import Path
from typing import Any
import os
from engine.tool import register_tool
from skills._common import check_sandbox, safe_path, err, truncate


def conduit_search_files(query: str, scope: str = "all", max_results: int = 10) -> str:
    """在 Conduit 仓库中搜索包含关键词的文件"""
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())
    if not repo_path.exists():
        return err(f"仓库路径不存在: {repo_path}")

    keywords = query.lower().split()
    results: list[tuple[int, Path]] = []

    extensions = {".js", ".jsx", ".ts", ".tsx", ".py", ".json", ".md", ".css", ".html"}
    skip_dirs = {"node_modules", "__pycache__", ".git", "dist", ".next"}

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        rel_root = Path(root).relative_to(repo_path)

        if scope == "backend" and str(rel_root).startswith("frontend"):
            continue
        if scope == "frontend" and str(rel_root).startswith("backend"):
            continue

        for f in files:
            if not any(f.endswith(ext) for ext in extensions):
                continue
            fpath = Path(root) / f
            try:
                content = fpath.read_text(encoding="utf-8", errors="ignore").lower()
                score = sum(1 for kw in keywords if kw in content)
                if score > 0:
                    results.append((score, fpath))
            except Exception:
                continue

    results.sort(reverse=True)
    lines = [f"[{score}] {p.relative_to(repo_path)}" for score, p in results[:max_results]]
    if not lines:
        return "未找到匹配文件"
    return "\n".join(lines)


def conduit_read_context(path: str, highlight_lines: list[int] | None = None) -> str:
    """读取 Conduit 仓库中的文件内容"""
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())
    try:
        full_path = safe_path(path, repo_path)
    except ValueError as e:
        return err(str(e))

    if not check_sandbox(full_path, [repo_path]):
        return err(f"路径越界: {path}")

    if not full_path.exists():
        return err(f"文件不存在: {path}")

    try:
        lines = full_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception as e:
        return err(f"读取失败: {e}")

    if highlight_lines:
        output = []
        for i, line in enumerate(lines, 1):
            prefix = ">>> " if i in highlight_lines else "    "
            output.append(f"{prefix}{i:4d} | {line}")
        return "\n".join(output)

    return truncate("\n".join(lines), 3000)


def conduit_write_code(path: str, content: str, description: str = "") -> str:
    """写入代码到 Conduit 仓库（原子写入）"""
    from config import get_conduit_repo_path
    from engine.io_utils import atomic_write

    repo_path = Path(get_conduit_repo_path())
    try:
        full_path = safe_path(path, repo_path)
    except ValueError as e:
        return err(str(e))

    if not check_sandbox(full_path, [repo_path]):
        return err(f"路径越界: {path}")

    try:
        # 保留备份
        if full_path.exists():
            backup_dir = repo_path / ".backups"
            backup_dir.mkdir(exist_ok=True)
            import shutil
            ts = Path(__file__).stat().st_mtime
            backup_path = backup_dir / f"{full_path.name}.{int(ts)}.bak"
            shutil.copy(full_path, backup_path)

        atomic_write(full_path, content)
        return f"OK: 已写入 {path}" + (f"\n说明: {description}" if description else "")
    except Exception as e:
        return err(f"写入失败: {e}")


def conduit_search_keyword(pattern: str, scope: str = "all", max_results: int = 20) -> str:
    """按正则表达式在仓库中搜索匹配行"""
    import re
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())
    try:
        compiled = re.compile(pattern)
    except re.error as e:
        return err(f"正则错误: {e}")

    results: list[str] = []
    skip_dirs = {"node_modules", "__pycache__", ".git", "dist"}

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        rel_root = Path(root).relative_to(repo_path)

        if scope == "backend" and str(rel_root).startswith("frontend"):
            continue
        if scope == "frontend" and str(rel_root).startswith("backend"):
            continue

        for f in files:
            if not (f.endswith((".js", ".jsx", ".ts", ".tsx", ".py"))):
                continue
            fpath = Path(root) / f
            try:
                lines = fpath.read_text(encoding="utf-8", errors="ignore").splitlines()
                for i, line in enumerate(lines, 1):
                    if compiled.search(line):
                        rel = fpath.relative_to(repo_path)
                        results.append(f"{rel}:{i}: {line.rstrip()}")
                        if len(results) >= max_results:
                            break
            except Exception:
                continue
        if len(results) >= max_results:
            break

    if not results:
        return "未找到匹配"
    return "\n".join(results[:max_results])


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "conduit_search_files",
            "description": "在 Conduit 仓库中搜索包含关键词的文件",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "scope": {"type": "string", "description": "搜索范围: backend/frontend/all", "enum": ["backend", "frontend", "all"], "default": "all"},
                    "max_results": {"type": "integer", "description": "最大返回文件数", "default": 10},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conduit_read_context",
            "description": "读取 Conduit 仓库中的文件内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径（相对于仓库根）"},
                    "highlight_lines": {"type": "array", "items": {"type": "integer"}, "description": "高亮行号"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conduit_write_code",
            "description": "写入代码到 Conduit 仓库（原子写入）",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "目标文件路径"},
                    "content": {"type": "string", "description": "代码内容"},
                    "description": {"type": "string", "description": "变更说明"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conduit_search_keyword",
            "description": "按正则表达式在仓库中搜索匹配行",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "正则表达式"},
                    "scope": {"type": "string", "description": "backend/frontend/all", "enum": ["backend", "frontend", "all"], "default": "all"},
                    "max_results": {"type": "integer", "description": "最大返回行数", "default": 20},
                },
                "required": ["pattern"],
            },
        },
    },
]

HANDLERS = {
    "conduit_search_files": conduit_search_files,
    "conduit_read_context": conduit_read_context,
    "conduit_write_code": conduit_write_code,
    "conduit_search_keyword": conduit_search_keyword,
}


def register():
    for s in TOOLS:
        name = s["function"]["name"]
        register_tool(s, HANDLERS[name])
