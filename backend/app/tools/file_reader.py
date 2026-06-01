import json
import os
from pathlib import Path

from app.tools.registry import tool_registry


def _find_project_root() -> Path:
    """Find project root. Priority:
    1. PROJECT_ROOT env var (explicit, used in Docker/container deployments)
    2. Auto-detect via marker files (.git, AGENT.md, docker-compose.yml, etc.)
    3. Fallback to __file__ location (never root filesystem)
    """
    # 1. Explicit env var
    env_root = os.environ.get("PROJECT_ROOT")
    if env_root:
        p = Path(env_root).expanduser().resolve()
        if p.exists() and p.is_dir():
            return p
        raise RuntimeError(f"PROJECT_ROOT='{env_root}' does not exist or is not a directory.")

    # 2. Auto-detect via markers (AGENT.md excluded — it now lives inside backend/
    # and would incorrectly anchor ROOT_DIR at backend/ instead of project root)
    markers = {".git", "pyproject.toml", "CLAUDE.md", ".claude", "docker-compose.yml"}
    start = Path(__file__).resolve().parent
    for parent in [start, *start.parents]:
        if str(parent) == "/":
            break
        if any((parent / marker).exists() for marker in markers):
            return parent

    # 3. Fallback: anchor at the directory containing this file (backend/app/tools/ -> backend/)
    fallback = Path(__file__).resolve().parent.parent
    if str(fallback) == "/":
        raise RuntimeError("Cannot determine project root: reached filesystem root without finding markers.")
    return fallback


ROOT_DIR = _find_project_root()
ALLOWED_EXTENSIONS = {".md", ".yaml", ".yml", ".txt", ".json", ".py", ".ts", ".js"}
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".pytest_cache",
    "dist", "build", ".vite", ".next", "coverage",
    ".mypy_cache", ".tox", ".eggs", ".claude", "openspec",
}


def _is_inside_project(resolved: Path) -> bool:
    try:
        resolved.relative_to(ROOT_DIR.resolve())
        return True
    except ValueError:
        return False


def _check_path(path: str) -> Path:
    target = Path(path).expanduser().resolve()
    if not _is_inside_project(target):
        raise ValueError(f"Access denied: path '{path}' is outside the project directory.")
    return target


def _should_skip(path: Path) -> bool:
    for part in path.parts:
        if part in SKIP_DIRS:
            return True
    return False


def _describe_dir(path: Path, max_files: int = 20) -> str:
    """Return a concise description of a directory."""
    rel_path = path.relative_to(ROOT_DIR)
    lines = [f"=== Directory: {rel_path} ==="]

    # Try to find a description from SKILL.md or README.md
    desc = ""
    for desc_file in ("SKILL.md", "README.md", "readme.md"):
        desc_path = path / desc_file
        if desc_path.is_file():
            try:
                content = desc_path.read_text(encoding="utf-8", errors="ignore")[:1500]
                if content.startswith("---"):
                    fm_end = content.find("---", 3)
                    if fm_end > 0:
                        fm = content[3:fm_end]
                        for line in fm.splitlines():
                            if line.strip().startswith("description:"):
                                desc = line.split(":", 1)[1].strip()
                                break
                if not desc and content.strip():
                    for line in content.splitlines():
                        stripped = line.strip()
                        if stripped and not stripped.startswith("#") and not stripped.startswith("---"):
                            desc = stripped[:200]
                            break
            except Exception:
                pass
            break

    if desc:
        lines.append(f"Description: {desc}")

    files = []
    dirs = []
    for child in sorted(path.iterdir()):
        if _should_skip(child):
            continue
        rel = child.relative_to(ROOT_DIR)
        if child.is_dir():
            dirs.append(str(rel))
        elif child.suffix.lower() in ALLOWED_EXTENSIONS:
            files.append(str(rel))

    if dirs:
        lines.append(f"Subdirectories ({len(dirs)}):")
        for d in dirs[:10]:
            lines.append(f"  {d}/")
        if len(dirs) > 10:
            lines.append(f"  ... and {len(dirs) - 10} more")

    if files:
        lines.append(f"Files ({len(files)}):")
        for f in files[:max_files]:
            lines.append(f"  {f}")
        if len(files) > max_files:
            lines.append(f"  ... and {len(files) - max_files} more")

    if not dirs and not files:
        lines.append("(empty directory)")

    return "\n".join(lines)


def _read_file(path: Path) -> str:
    """Read a text file and return its content."""
    ext = path.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"[Unsupported file type: {ext}] {path.relative_to(ROOT_DIR)}"
    try:
        return path.read_text(encoding="utf-8")
    except Exception as e:
        return f"[Error reading file] {path.relative_to(ROOT_DIR)}: {e}"


def _search_name(names: list[str]) -> tuple[list[Path], list[Path]]:
    """Search for files and directories by name (case-insensitive, partial match).
    Returns (directories, files). Collects ALL matches first to avoid missing deep dirs."""
    dir_results: list[Path] = []
    file_results: list[Path] = []
    lower_names = [n.lower() for n in names]

    for p in ROOT_DIR.rglob("*"):
        if _should_skip(p):
            continue
        try:
            lower_name = p.name.lower()
            matched = any(lower_name == ln for ln in lower_names)
            if not matched:
                matched = any(ln in lower_name for ln in lower_names)
            if matched:
                if p.is_dir() and p not in dir_results:
                    dir_results.append(p)
                elif p.suffix.lower() in ALLOWED_EXTENSIONS and p not in file_results:
                    file_results.append(p)
        except OSError:
            # Skip special files like /proc entries that raise PermissionError
            continue

    return dir_results, file_results


def _search_content(keywords: list[str], max_files: int = 200, max_matches_per_file: int = 3, max_total_files: int = 15) -> tuple[list[dict], int]:
    """Search for keywords in file contents. Returns (results, files_scanned).
    Results are concise: one line per match, truncated to 120 chars."""
    results = []
    lower_keywords = [k.lower() for k in keywords]
    files_scanned = 0
    seen_paths: set[str] = set()

    for p in ROOT_DIR.rglob("*"):
        if _should_skip(p):
            continue
        try:
            if not p.is_file() or p.suffix.lower() not in ALLOWED_EXTENSIONS:
                continue
        except OSError:
            continue

        files_scanned += 1
        if files_scanned > max_files:
            break

        try:
            content = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        rel_path = str(p.relative_to(ROOT_DIR))
        matches = []
        lines = content.splitlines()
        for i, line in enumerate(lines, start=1):
            if any(lk in line.lower() for lk in lower_keywords):
                snippet = line.strip()
                if len(snippet) > 120:
                    snippet = snippet[:117] + "..."
                matches.append({"line": i, "snippet": snippet})
                if len(matches) >= max_matches_per_file:
                    break

        if matches and rel_path not in seen_paths:
            seen_paths.add(rel_path)
            results.append({"path": rel_path, "matches": matches})
            if len(results) >= max_total_files:
                break

    return results, files_scanned


def _extract_keywords(query: str) -> list[str]:
    """Extract search keywords from a natural language query.
    Splits by comma first, then removes common Chinese filler words."""
    raw = [k.strip() for k in query.split(",") if k.strip()]
    if not raw:
        raw = [query]

    # For single queries that look like natural language (contain Chinese filler words),
    # try to extract meaningful keywords.
    if len(raw) == 1 and len(query) > 3:
        fillers = {"一下", "的", "和", "或", "以及", "相关", "有关", "包含", "查找", "搜索", "文件", "文件夹", "目录", "路径"}
        # Simple heuristic: if query contains filler words, try to split by them
        words = query
        for f in fillers:
            words = words.replace(f, ",")
        split = [k.strip() for k in words.split(",") if k.strip() and len(k.strip()) > 1]
        if len(split) > 1:
            return split

    return raw


def read_local_file(path: str) -> str:
    """Read a file/directory, or search for files/directories by name or content.

    Behavior:
    1. If path is an existing file → return file content.
    2. If path is an existing directory → return directory listing.
    3. Otherwise → search mode: find files/directories by name, and optionally by content.

    In search mode:
    - Name search: lists matching directories and files (paths only, no content read).
    - Content search: lists files containing the keyword, with line snippets.
    - Long natural-language queries (>30 chars) skip content search to avoid noise.
    """
    raw_path = Path(path)

    # For relative paths, resolve against ROOT_DIR instead of CWD (fixes Linux/CWD mismatch)
    if not raw_path.is_absolute():
        resolved = (ROOT_DIR / raw_path).expanduser().resolve()
    else:
        resolved = raw_path.expanduser().resolve()

    # Determine if this looks like an explicit path request
    looks_like_path = '/' in path or '\\' in path or raw_path.is_absolute()

    # 1. Exact file path → read content
    if looks_like_path and resolved.exists() and resolved.is_file():
        try:
            _check_path(str(resolved))
            return _read_file(resolved)
        except ValueError as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    # 2. Exact directory path → list structure
    if looks_like_path and resolved.exists() and resolved.is_dir():
        try:
            _check_path(str(resolved))
            return _describe_dir(resolved)
        except ValueError as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    # 3. Absolute non-existent path → error
    if raw_path.is_absolute():
        try:
            _check_path(str(resolved))
        except ValueError as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)
        return json.dumps({"error": f"Path not found: '{path}'"}, ensure_ascii=False)

    # 4. Search mode (pure names or non-existent paths)
    keywords = _extract_keywords(path)
    is_long_query = len(path) > 30
    parts: list[str] = []

    # 4a. Name search — list paths only, never read file content
    dir_results, file_results = _search_name(keywords)

    if dir_results:
        parts.append(f"=== Directories ({len(dir_results)}) ===")
        for d in dir_results[:15]:
            parts.append(f"  {d.relative_to(ROOT_DIR)}")
        if len(dir_results) > 15:
            parts.append(f"  ... and {len(dir_results) - 15} more")

    if file_results:
        if parts:
            parts.append("")
        parts.append(f"=== Files ({len(file_results)}) ===")
        for f in file_results[:15]:
            parts.append(f"  {f.relative_to(ROOT_DIR)}")
        if len(file_results) > 15:
            parts.append(f"  ... and {len(file_results) - 15} more")

    # 4b. Content search — concise snippets, skip for long natural-language queries
    if not is_long_query:
        content_results, files_scanned = _search_content(keywords)
        if content_results:
            if parts:
                parts.append("")
            parts.append(f"=== Content matches ({len(content_results)} files, scanned {files_scanned}) ===")
            for item in content_results:
                parts.append(f"\n--- {item['path']} ---")
                for match in item["matches"]:
                    parts.append(f"  L{match['line']}: {match['snippet']}")

    if parts:
        return "\n".join(parts)

    return json.dumps({"error": f"No matches found for '{path}'"}, ensure_ascii=False)


@tool_registry.register(
    name="read_local_file",
    description=(
        "读取本地项目中的文本文件，或搜索文件/目录的位置和内容。"
        "支持 md、yaml、txt、json、py、ts、js 等文本格式。"
        "用法1：传入精确路径，直接读取文件内容或目录结构。"
        "用法2：传入名称或关键词，搜索匹配的文件/目录位置和内容。"
        "搜索时只返回路径列表和精简的内容片段，不会读取整个文件。"
        "支持用逗号分隔多个关键词（如'数据库,sqlite,db'）一次性搜索。"
        "CRITICAL: 一次调用即可返回所有匹配结果，不要反复调用不同关键词。"
    ),
    tool_type="function",
    parameters={
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": (
                    "文件路径、目录路径、文件/目录名称或搜索关键词。"
                    "精确路径会直接读取内容；名称/关键词会搜索位置和文件内容。"
                    "支持逗号分隔多个关键词一次性搜索，不要反复调用。"
                    "例如：README.md、backend/app/main.py、scripts、数据库,sqlite,db"
                ),
            }
        },
        "required": ["path"],
    },
)
def _read_local_file_tool(path: str) -> str:
    return read_local_file(path)
