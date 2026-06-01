"""RAG indexer — 文件级索引构建"""

import re
import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class FileEntry:
    """文件索引条目"""
    path: str
    summary: str = ""
    keywords: list[str] = field(default_factory=list)
    lines: int = 0
    tokens: int = 0
    lang: str = ""

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "summary": self.summary,
            "keywords": self.keywords,
            "lines": self.lines,
            "tokens": self.tokens,
            "lang": self.lang,
        }


LANG_MAP = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".json": "json",
    ".md": "markdown",
    ".css": "css",
    ".html": "html",
}


_KEYWORD_PATTERNS = {
    "model": ["class", "sequelize", "define", "DataTypes", "associate"],
    "controller": ["router", "async", "try", "catch", "await"],
    "service": ["axios", "get", "post", "put", "delete"],
    "component": ["function", "const", "return", "jsx", "tsx"],
    "middleware": ["next", "request", "response", "auth"],
    "context": ["createContext", "useContext", "useState"],
}


def _summarize(content: str, lang: str) -> tuple[str, list[str]]:
    """从文件内容提取摘要和关键词"""
    keywords: list[str] = []

    for kw_type, patterns in _KEYWORD_PATTERNS.items():
        for p in patterns:
            if p in content:
                keywords.append(kw_type)
                break

    if lang == "markdown":
        lines = [l.strip().lstrip("#*_`") for l in content.splitlines() if l.strip()]
        summary = " ".join(lines[:3])
    elif lang in ("javascript", "typescript"):
        # 提取函数名
        funcs = re.findall(r"(?:function|const|let|async)\s+(\w+)\s*[=\(]", content)
        if funcs:
            keywords.extend(funcs[:5])
        # 提取 import
        imports = re.findall(r"import\s+.*?from\s+['\"](.+?)['\"]", content)
        if imports:
            keywords.extend(imports[:3])
        summary = f"Functions: {', '.join(funcs[:5])}"
    else:
        summary = content[:200]

    return summary[:200], list(set(keywords))[:20]


class FileIndex:
    """文件级索引 — 扫描仓库所有文件并构建关键词映射"""

    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.index: dict[str, FileEntry] = {}

    def build(self) -> int:
        """扫描仓库，构建索引。返回文件数量。"""
        count = 0
        skip_dirs = {"node_modules", "__pycache__", ".git", "dist", ".next", "coverage", ".venv", "venv"}

        for root, dirs, files in os.walk(self.repo_path):
            dirs[:] = [d for d in dirs if d not in skip_dirs]

            for f in files:
                ext = Path(f).suffix.lower()
                if ext not in LANG_MAP:
                    continue

                fpath = Path(root) / f
                rel = str(fpath.relative_to(self.repo_path))

                try:
                    content = fpath.read_text(encoding="utf-8", errors="ignore")
                    lines = content.splitlines()
                    lang = LANG_MAP.get(ext, "text")
                    summary, keywords = _summarize(content, lang)
                    tokens = len(content) // 4  # 粗略估算

                    self.index[rel] = FileEntry(
                        path=rel,
                        summary=summary,
                        keywords=keywords,
                        lines=len(lines),
                        tokens=tokens,
                        lang=lang,
                    )
                    count += 1
                except Exception:
                    continue

        return count

    def search(self, query: str, scope: str = "all") -> list[FileEntry]:
        """关键词 + 正则匹配搜索"""
        keywords = query.lower().split()
        results: list[tuple[int, FileEntry]] = []

        for path, entry in self.index.items():
            if scope == "backend" and not path.startswith("backend/"):
                continue
            if scope == "frontend" and not path.startswith("frontend/"):
                continue

            score = 0
            for kw in keywords:
                if kw in entry.summary.lower():
                    score += 3
                if any(kw in k for k in entry.keywords):
                    score += 2
                if kw in path.lower():
                    score += 1

            if score > 0:
                results.append((score, entry))

        results.sort(key=lambda x: x[0], reverse=True)
        return [entry for _, entry in results]

    def save(self, path: str | None = None) -> None:
        """持久化索引"""
        import json
        if path is None:
            path = str(self.repo_path / ".rag_index.json")
        data = {k: v.to_dict() for k, v in self.index.items()}
        Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def load(self, path: str | None = None) -> bool:
        """加载索引"""
        import json
        if path is None:
            path = str(self.repo_path / ".rag_index.json")
        p = Path(path)
        if not p.exists():
            return False
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            self.index = {k: FileEntry(**v) for k, v in data.items()}
            return True
        except Exception:
            return False
