"""RAG retriever — 混合召回引擎"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rag.indexer import FileIndex, FileEntry
    from rag.code_graph import CodeGraph


@dataclass
class RetrievalResult:
    """召回结果"""
    files: list["FileEntry"]
    summary: str
    tokens_est: int


@dataclass
class ConduitRetriever:
    """Conduit 仓库混合召回 — 文件索引 + 代码图谱 + Schema 映射"""
    repo_path: str
    _file_index: "FileIndex | None" = field(default=None, repr=False)
    _code_graph: "CodeGraph | None" = field(default=None, repr=False)

    def _get_file_index(self) -> "FileIndex":
        from rag.indexer import FileIndex
        if self._file_index is None:
            self._file_index = FileIndex(self.repo_path)
            if not self._file_index.load():
                self._file_index.build()
                self._file_index.save()
        return self._file_index

    def _get_code_graph(self):
        from rag.code_graph import CodeGraph
        if self._code_graph is None:
            self._code_graph = CodeGraph(self.repo_path)
            if not self._code_graph.load():
                self._code_graph.build()
                self._code_graph.save()
        return self._code_graph

    def retrieve(self, query: str, scope: str = "all") -> RetrievalResult:
        """
        混合召回：
        1. 关键词匹配 → 文件候选
        2. 代码图谱 → 函数调用链上下文
        3. Schema 映射 → 实体相关文件
        """
        file_index = self._get_file_index()

        # 第一层：文件索引搜索
        candidates = file_index.search(query, scope)

        # 第二层：代码图谱扩展
        code_graph = self._get_code_graph()

        # 从查询中提取可能的函数名
        func_candidates = re.findall(r"\b([a-z][a-zA-Z]{2,})\b", query)
        expanded: list = []
        for fc in func_candidates[:3]:
            chain = code_graph.get_call_chain(fc, depth=2)
            expanded.extend(chain)

        # 第三层：Schema 实体映射
        entity_keywords = ["article", "user", "comment", "tag", "favorite", "auth", "profile"]
        schema_hint = None
        for kw in entity_keywords:
            if kw in query.lower():
                schema_hint = kw
                break

        if schema_hint:
            schema_files = file_index.search(schema_hint, scope)
            for sf in schema_files[:3]:
                if sf not in candidates:
                    candidates.append(sf)

        # 合并并去重
        seen = set()
        unique: list = []
        for c in candidates:
            if c.path not in seen:
                seen.add(c.path)
                unique.append(c)

        tokens_est = sum(c.tokens for c in unique[:20])
        return RetrievalResult(
            files=unique[:20],
            summary=self._summarize(query, unique[:10]),
            tokens_est=tokens_est,
        )

    def _summarize(self, query: str, candidates: list) -> str:
        """生成召回摘要"""
        if not candidates:
            return "未找到相关文件"
        parts = [f"## 召回 {len(candidates)} 个相关文件"]
        parts.append(f"查询: {query}")
        for c in candidates[:5]:
            parts.append(f"- {c.path} ({c.lang}): {c.summary}")
        return "\n".join(parts)
