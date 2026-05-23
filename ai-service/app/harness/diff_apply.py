"""unified diff 解析 + 应用。

不自己写解析器: 用 unidiff 0.7.5 (PyPI 稳定, 标准 diff 格式覆盖好)。
对外接口:
  parse_diff(diff: str) -> PatchSet     语法不合法抛 DiffParseError
  apply_diff(diff: str, original: str)  应用到 original 字符串, 返回新内容
                                         上下文不匹配抛 DiffApplyError
"""

from typing import List
from unidiff import PatchSet
from unidiff.errors import UnidiffParseError


class DiffParseError(Exception):
    pass


class DiffApplyError(Exception):
    pass


def parse_diff(diff: str) -> PatchSet:
    if not diff.strip():
        raise DiffParseError("empty diff")
    try:
        ps = PatchSet(diff)
    except UnidiffParseError as e:
        raise DiffParseError(str(e)) from e
    if len(ps) == 0:
        raise DiffParseError("no patch files in diff")
    if all(len(pf) == 0 for pf in ps):
        raise DiffParseError("no hunks in diff")
    return ps


def apply_diff(diff: str, original: str) -> str:
    """把 diff 应用到 original 字符串上, 返回新内容。

    只处理单文件 diff (PatchSet[0])。
    """
    ps = parse_diff(diff)
    pf = ps[0]

    if pf.is_added_file:
        # 新文件: 拼所有 added line
        lines: List[str] = []
        for hunk in pf:
            for line in hunk:
                if line.is_added:
                    lines.append(line.value)
        return "".join(lines)

    original_lines = original.splitlines(keepends=True)
    if not original.endswith("\n") and original:
        # 让索引一致
        pass

    # 把 hunk 倒序应用 (避免行号错位)
    out_lines = list(original_lines)
    for hunk in reversed(list(pf)):
        src_start = hunk.source_start - 1  # 1-based → 0-based
        src_len = hunk.source_length
        # 校验上下文: hunk 里 source 行应与 original 对应行匹配
        expected = [ln.value for ln in hunk if not ln.is_added]
        actual = original_lines[src_start : src_start + src_len]
        if [e.rstrip("\n") for e in expected] != [a.rstrip("\n") for a in actual]:
            raise DiffApplyError(
                f"hunk context mismatch at line {hunk.source_start}: "
                f"expected {expected!r}, got {actual!r}"
            )
        # 替换为 target 内容
        new_lines = [ln.value for ln in hunk if not ln.is_removed]
        out_lines[src_start : src_start + src_len] = new_lines

    return "".join(out_lines)
