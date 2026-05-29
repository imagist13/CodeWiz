"""AcceptanceCheck — Skill 验收检查 (v3 Task 2).

3 个子类：FileContains / ForbidContains / GrepInDir，
+ AcceptanceResult 统一返回类型。
"""

from __future__ import annotations

import pytest

from app.skills.acceptance import (
    FileContains,
    ForbidContains,
    GrepInDir,
    AcceptanceResult,
)


class FakeFs:
    """最小 FsToolsLike 假实现 — 内存里塞文件，单测无 IO。"""

    def __init__(self, files: dict[str, str]):
        self._files = files

    def read_file(self, path: str) -> str:
        if path not in self._files:
            raise FileNotFoundError(path)
        return self._files[path]

    def file_exists(self, path: str) -> bool:
        return path in self._files

    def grep(self, pattern: str, path: str) -> list[str]:
        import re

        rx = re.compile(pattern)
        hits = []
        for fp, text in self._files.items():
            if not fp.startswith(path.rstrip("/") + "/") and fp != path:
                continue
            for ln, line in enumerate(text.splitlines(), 1):
                if rx.search(line):
                    hits.append(f"{fp}:{ln}:{line}")
        return hits


class TestFileContains:
    def test_ok(self):
        fs = FakeFs({"a.js": "let x = viewCount;"})
        r = FileContains(path="a.js", needle="viewCount").run(fs)
        assert r.ok is True

    def test_missing_file(self):
        fs = FakeFs({})
        r = FileContains(path="a.js", needle="viewCount").run(fs)
        assert r.ok is False
        assert "not found" in r.detail.lower()

    def test_needle_absent(self):
        fs = FakeFs({"a.js": "let x = foo;"})
        r = FileContains(path="a.js", needle="viewCount").run(fs)
        assert r.ok is False


class TestForbidContains:
    def test_path_absent_is_ok(self):
        """v2.1 R-3: 路径不存在 → ok（不是 fail），因为没文件可以被污染."""
        fs = FakeFs({})
        r = ForbidContains(path="Editor.jsx", needle="viewCount").run(fs)
        assert r.ok is True

    def test_path_exists_without_needle_is_ok(self):
        fs = FakeFs({"Editor.jsx": "let x = body;"})
        r = ForbidContains(path="Editor.jsx", needle="viewCount").run(fs)
        assert r.ok is True

    def test_path_exists_with_needle_fails(self):
        fs = FakeFs({"Editor.jsx": "<input name='viewCount' />"})
        r = ForbidContains(path="Editor.jsx", needle="viewCount").run(fs)
        assert r.ok is False
        assert "forbidden" in r.detail.lower()


class TestGrepInDir:
    def test_min_hits_satisfied(self):
        fs = FakeFs(
            {
                "src/a.js": "viewCount",
                "src/b.js": "viewCount\nviewCount",
            }
        )
        r = GrepInDir(dir="src", pattern=r"viewCount", min_hits=1).run(fs)
        assert r.ok is True

    def test_min_hits_higher_threshold(self):
        fs = FakeFs({"src/a.js": "viewCount"})
        r = GrepInDir(dir="src", pattern=r"viewCount", min_hits=2).run(fs)
        assert r.ok is False
        assert "hits=1" in r.detail
        assert "need=2" in r.detail

    def test_zero_hits_fails(self):
        fs = FakeFs({"src/a.js": "nothing here"})
        r = GrepInDir(dir="src", pattern=r"viewCount", min_hits=1).run(fs)
        assert r.ok is False

    def test_min_hits_must_be_positive(self):
        with pytest.raises(Exception):  # ValidationError
            GrepInDir(dir="src", pattern=r"x", min_hits=0)


class TestAcceptanceResult:
    def test_check_str_present(self):
        r = AcceptanceResult(check="X", ok=True, detail="")
        assert r.check == "X"
        assert r.ok is True

    def test_str_repr_of_checks(self):
        """三个子类的 __str__ 必须包含关键 args，方便调试和日志."""
        assert "viewCount" in str(FileContains(path="a.js", needle="viewCount"))
        assert "Editor" in str(ForbidContains(path="Editor.jsx", needle="x"))
        assert "src" in str(GrepInDir(dir="src", pattern="x", min_hits=1))
