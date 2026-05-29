"""unified diff 解析 + 应用。

不自己写解析器: 用 unidiff 0.7.5 (PyPI 稳定, 标准 diff 格式覆盖好)。
对外接口:
  parse_diff(diff: str) -> PatchSet     语法不合法抛 DiffParseError
  apply_diff(diff: str, original: str)  应用到 original 字符串, 返回新内容
                                         上下文不匹配抛 DiffApplyError
"""

import re
from typing import List
from unidiff import PatchSet
from unidiff.errors import UnidiffParseError


class DiffParseError(Exception):
    pass


class DiffApplyError(Exception):
    pass


_HUNK_RE = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def normalize_hunk_headers(diff: str) -> str:
    """重算每个 hunk header 的 Y/Z。

    LLM (尤其推理模型) 经常算错 `@@ -X,Y +X,Z @@` 中的 Y/Z, 而 unidiff 严格校验。
    起始行号 X 一般写得对, body 也对; 这里扫 body 实际的 ` `/`+`/`-` 行数,
    覆盖 header 里声明的长度。LLM 没写 Y/Z 时也会自动补齐。
    """
    lines = diff.splitlines(keepends=True)
    out: List[str] = []
    i = 0
    while i < len(lines):
        raw = lines[i]
        stripped = raw.rstrip("\r\n")
        m = _HUNK_RE.match(stripped)
        if not m:
            out.append(raw)
            i += 1
            continue
        # 扫 body 直到下一个 @@ / 文件头 / 文件末尾
        j = i + 1
        src_len = 0
        tgt_len = 0
        while j < len(lines):
            body = lines[j]
            head = body.rstrip("\r\n")
            if (
                head.startswith("@@")
                or head.startswith("--- ")
                or head.startswith("+++ ")
            ):
                break
            if body.startswith("\\"):
                pass
            elif body.startswith("+"):
                tgt_len += 1
            elif body.startswith("-"):
                src_len += 1
            else:
                src_len += 1
                tgt_len += 1
            j += 1
        src_start = m.group(1)
        tgt_start = m.group(2)
        trailing = stripped[m.end() :]
        line_ending = raw[len(stripped) :]
        new_header = (
            f"@@ -{src_start},{src_len} +{tgt_start},{tgt_len} @@"
            f"{trailing}{line_ending}"
        )
        out.append(new_header)
        out.extend(lines[i + 1 : j])
        i = j
    return "".join(out)


def strip_markdown_fence(diff: str) -> str:
    """剥除 LLM 输出里的 ``` 围栏 (DeepSeek 系常见行为)。

    unified diff body 不会以 ``` 开头, 所以删任意位置 ``` 开头的整行都安全。
    覆盖 (a) 整体首尾包裹 (b) 多段 diff 各自带围栏 两种 LLM 模式。
    """
    lines = diff.splitlines()
    kept = [ln for ln in lines if not ln.lstrip().startswith("```")]
    out = "\n".join(kept)
    if diff.endswith("\n") and not out.endswith("\n"):
        out += "\n"
    return out


def parse_diff(diff: str) -> PatchSet:
    if not diff.strip():
        raise DiffParseError("empty diff")
    try:
        ps = PatchSet(normalize_hunk_headers(strip_markdown_fence(diff)))
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
