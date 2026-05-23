"""CodeMap：扫描 Conduit 仓库生成符号索引。

Pattern Skill 通过 target_symbols 声明依赖的符号类别（"models"/"routes"
/"components"/"hooks"），step_executor 用 codemap.find(kind, name)
拿到精确文件路径——这是我们"超越 RAG 暴力切片"的核心。

scan_conduit() 在 Task 6 实现。
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


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
