"""RAG code_graph — AST 代码图谱（函数调用链）"""

import json
import re
import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class FuncNode:
    """函数节点"""
    name: str
    file: str
    line: int
    params: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "file": self.file,
            "line": self.line,
            "params": self.params,
        }


class CodeGraph:
    """代码图谱 — 解析 JS/JSX 文件，提取函数定义和调用关系"""

    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.nodes: dict[str, FuncNode] = {}  # func_id -> FuncNode
        self.edges: dict[str, list[str]] = {}  # caller_id -> [callee_name]

    def _func_id(self, name: str, file: str) -> str:
        return f"{file}::{name}"

    def _parse_file(self, fpath: Path) -> None:
        """解析单个 JS/JSX 文件"""
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return

        rel = str(fpath.relative_to(self.repo_path))

        # 提取函数定义
        func_def_patterns = [
            r"function\s+(\w+)\s*\(([^)]*)\)",           # function name(...)
            r"(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(",  # const name = (...
            r"(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function",  # const name = function
            r"(?:export\s+)?(?:async\s+)?function\s+(\w+)",  # export function name
        ]

        for pattern in func_def_patterns:
            for match in re.finditer(pattern, content):
                name = match.group(1)
                params_str = match.group(2) if match.lastindex >= 2 else ""
                params = [p.strip() for p in params_str.split(",") if p.strip()]
                line_num = content[:match.start()].count("\n") + 1

                fid = self._func_id(name, rel)
                self.nodes[fid] = FuncNode(name=name, file=rel, line=line_num, params=params)

        # 提取函数调用
        call_pattern = r"\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\("
        defined_names = {n.name for n in self.nodes.values()}

        for match in re.finditer(call_pattern, content):
            call_name = match.group(1)
            if call_name in defined_names:
                # 找到定义该函数的位置作为 caller
                for fid, node in self.nodes.items():
                    if node.file == rel:
                        if fid not in self.edges:
                            self.edges[fid] = []
                        if call_name not in self.edges[fid]:
                            self.edges[fid].append(call_name)

    def build(self) -> None:
        """扫描所有 JS/JSX 文件构建图谱"""
        skip = {"node_modules", "__pycache__", ".git", "dist"}
        for root, dirs, files in os.walk(self.repo_path):
            dirs[:] = [d for d in dirs if d not in skip]
            for f in files:
                if f.endswith((".js", ".jsx")):
                    self._parse_file(Path(root) / f)

    def get_call_chain(self, func_name: str, depth: int = 3) -> list[FuncNode]:
        """获取函数调用链"""
        visited: set[str] = set()
        result: list[FuncNode] = []

        def dfs(name: str, d: int):
            if d > depth:
                return
            for fid, node in self.nodes.items():
                if node.name == name and fid not in visited:
                    if node.file in [n.file for n in result] and fid not in visited:
                        visited.add(fid)
                        result.append(node)
                    for callee_name in self.edges.get(fid, []):
                        dfs(callee_name, d + 1)

        dfs(func_name, 0)
        return result[:10]

    def save(self, path: str | None = None) -> None:
        if path is None:
            path = str(self.repo_path / ".code_graph.json")
        data = {
            "nodes": {k: v.to_dict() for k, v in self.nodes.items()},
            "edges": self.edges,
        }
        Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def load(self, path: str | None = None) -> bool:
        if path is None:
            path = str(self.repo_path / ".code_graph.json")
        p = Path(path)
        if not p.exists():
            return False
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            self.nodes = {k: FuncNode(**v) for k, v in data["nodes"].items()}
            self.edges = data.get("edges", {})
            return True
        except Exception:
            return False
