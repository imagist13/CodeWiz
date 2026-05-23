"""CodeMap：扫描 Conduit 仓库生成符号索引。

Pattern Skill 通过 target_symbols 声明依赖的符号类别（"models"/"routes"
/"components"/"hooks"），step_executor 用 codemap.find(kind, name)
拿到精确文件路径——这是我们"超越 RAG 暴力切片"的核心。
"""

import re
import time
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, Field
from tree_sitter_languages import get_language, get_parser


class SymbolRef(BaseModel):
    file: str
    line: int = Field(ge=0)
    col: int = Field(default=0, ge=0)
    snippet: Optional[str] = None


class CodeMap(BaseModel):
    repo_root: str
    generated_at: float

    models: Dict[str, SymbolRef]
    routes: Dict[str, SymbolRef]
    components: Dict[str, SymbolRef]
    hooks: Dict[str, SymbolRef]
    migrations_dir: str
    test_dir: str

    def find(self, kind: str, name: str) -> SymbolRef:
        table = self._table(kind)
        if name not in table:
            raise KeyError(f"{kind}/{name} not in CodeMap")
        return table[name]

    def list(self, kind: str) -> List[str]:
        return sorted(self._table(kind).keys())

    def _table(self, kind: str) -> Dict[str, SymbolRef]:
        if kind not in {"models", "routes", "components", "hooks"}:
            raise KeyError(f"unknown symbol kind: {kind}")
        return getattr(self, kind)


_JS = get_parser("javascript")
_JS_LANG = get_language("javascript")


_MODEL_QUERY = _JS_LANG.query("""
(call_expression
  function: (member_expression
    object: (identifier) @cls
    property: (property_identifier) @method (#eq? @method "init"))
) @call
""")


def _scan_models(repo: Path) -> Dict[str, SymbolRef]:
    out: Dict[str, SymbolRef] = {}
    models_dir = repo / "backend" / "db" / "models"
    if not models_dir.exists():
        return out
    for js_file in models_dir.glob("*.js"):
        src = js_file.read_bytes()
        tree = _JS.parse(src)
        captures = _MODEL_QUERY.captures(tree.root_node)
        for node, name in captures:
            if name == "cls":
                model_name = node.text.decode()
                rel = str(js_file.relative_to(repo))
                out[model_name] = SymbolRef(
                    file=rel,
                    line=node.start_point[0] + 1,
                    col=node.start_point[1],
                )
                break  # 每文件只取第一个 Class.init() 调用
    return out


_ROUTE_RE = re.compile(
    r'router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']'
)


def _scan_routes(repo: Path) -> Dict[str, SymbolRef]:
    out: Dict[str, SymbolRef] = {}
    routes_dir = repo / "backend" / "routes"
    if not routes_dir.exists():
        return out
    for js_file in routes_dir.glob("*.js"):
        rel = str(js_file.relative_to(repo))
        for lineno, line in enumerate(js_file.read_text().splitlines(), 1):
            m = _ROUTE_RE.search(line)
            if m:
                method = m.group(1).upper()
                path = m.group(2)
                key = f"{method} {path}"
                out[key] = SymbolRef(file=rel, line=lineno)
    return out


_COMP_RE = re.compile(r"(?:function|const)\s+([A-Z][A-Za-z0-9]*)\s*[=(]")


def _scan_components(repo: Path) -> Dict[str, SymbolRef]:
    out: Dict[str, SymbolRef] = {}
    comp_dir = repo / "frontend" / "src" / "components"
    if not comp_dir.exists():
        return out
    for jsx_file in comp_dir.rglob("*.jsx"):
        rel = str(jsx_file.relative_to(repo))
        for lineno, line in enumerate(jsx_file.read_text().splitlines(), 1):
            m = _COMP_RE.search(line)
            if m:
                out[m.group(1)] = SymbolRef(file=rel, line=lineno)
                break  # 每文件只取顶层组件
    return out


def scan_conduit(repo_root: str) -> CodeMap:
    """扫描 Conduit 仓库生成 CodeMap。

    支持的符号类别：models / routes / components。
    hooks 留空（MVP 不需要；后续可扩展）。
    """
    root = Path(repo_root)
    if not root.exists():
        raise FileNotFoundError(f"repo not found: {repo_root}")

    return CodeMap(
        repo_root=repo_root,
        generated_at=time.time(),
        models=_scan_models(root),
        routes=_scan_routes(root),
        components=_scan_components(root),
        hooks={},
        migrations_dir=str(root / "backend" / "db" / "migrations"),
        test_dir=str(root / "tests"),
    )
