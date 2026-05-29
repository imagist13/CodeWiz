"""Skill 验收检查 (v3 Task 2).

Skill.contract() 声明任务的同时声明 acceptance: 一组语义化检查，
ExploreEditAgent 完工后逐个 run() 验证。

三个子类：
- FileContains:   文件存在且含 needle
- ForbidContains: 文件不存在时通过；存在则不能含 needle (禁止字段渗入编辑路径)
- GrepInDir:      目录下 grep pattern 命中数 >= min_hits
"""

from __future__ import annotations
from typing import Literal, Protocol, Union

from pydantic import BaseModel, Field


class FsToolsLike(Protocol):
    def read_file(self, path: str) -> str: ...
    def file_exists(self, path: str) -> bool: ...
    def grep(self, pattern: str, path: str) -> list[str]: ...


class AcceptanceResult(BaseModel):
    check: str
    ok: bool
    detail: str = ""


class FileContains(BaseModel):
    kind: Literal["file_contains"] = "file_contains"
    path: str
    needle: str

    def run(self, fs: FsToolsLike) -> AcceptanceResult:
        try:
            content = fs.read_file(self.path)
        except FileNotFoundError:
            return AcceptanceResult(
                check=str(self), ok=False, detail=f"file not found: {self.path}"
            )
        ok = self.needle in content
        return AcceptanceResult(
            check=str(self),
            ok=ok,
            detail="" if ok else f"'{self.needle}' not in {self.path}",
        )

    def __str__(self) -> str:
        return f"FileContains({self.path!r}, {self.needle!r})"


class ForbidContains(BaseModel):
    """路径不存在 → ok (没文件可污染); 存在则不能含 needle."""

    kind: Literal["forbid_contains"] = "forbid_contains"
    path: str
    needle: str

    def run(self, fs: FsToolsLike) -> AcceptanceResult:
        if not fs.file_exists(self.path):
            return AcceptanceResult(check=str(self), ok=True, detail="path absent (ok)")
        content = fs.read_file(self.path)
        ok = self.needle not in content
        return AcceptanceResult(
            check=str(self),
            ok=ok,
            detail="" if ok else f"forbidden '{self.needle}' found in {self.path}",
        )

    def __str__(self) -> str:
        return f"ForbidContains({self.path!r}, {self.needle!r})"


class GrepInDir(BaseModel):
    kind: Literal["grep_in_dir"] = "grep_in_dir"
    dir: str
    pattern: str
    min_hits: int = Field(default=1, ge=1)

    def run(self, fs: FsToolsLike) -> AcceptanceResult:
        hits = fs.grep(self.pattern, self.dir)
        ok = len(hits) >= self.min_hits
        return AcceptanceResult(
            check=str(self),
            ok=ok,
            detail=f"hits={len(hits)} need={self.min_hits}",
        )

    def __str__(self) -> str:
        return f"GrepInDir({self.dir!r}, {self.pattern!r}, min={self.min_hits})"


AcceptanceCheck = Union[FileContains, ForbidContains, GrepInDir]
