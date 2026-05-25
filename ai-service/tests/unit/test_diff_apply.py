import pytest
from app.harness.diff_apply import (
    parse_diff,
    apply_diff,
    normalize_hunk_headers,
    DiffParseError,
    DiffApplyError,
)


# LLM 经常写错 hunk header 长度. 这里覆盖 4 种典型错法.

# 1) 声明 source/target 都比实际少 1
_DIFF_HEADER_TOO_SMALL = """--- a/foo.js
+++ b/foo.js
@@ -1,2 +1,3 @@
 line1
+inserted
 line2
 line3
"""

# 2) 声明 source/target 都比实际多 1
_DIFF_HEADER_TOO_LARGE = """--- a/foo.js
+++ b/foo.js
@@ -1,4 +1,5 @@
 line1
+inserted
 line2
"""

# 3) header 全对
_DIFF_HEADER_CORRECT = """--- a/foo.js
+++ b/foo.js
@@ -1,2 +1,3 @@
 line1
+inserted
 line2
"""

# 4) 多 hunk, 第二个 hunk 长度算错
_DIFF_MULTI_HUNK_SECOND_WRONG = """--- a/foo.js
+++ b/foo.js
@@ -1,2 +1,3 @@
 a
+x
 b
@@ -10,1 +10,5 @@
 c
+y
+z
"""

# 5) header 不带 Y/W (`@@ -10 +10 @@`) - 合法但少见
_DIFF_NO_LENGTHS = """--- a/foo.js
+++ b/foo.js
@@ -1 +1 @@
 a
+inserted
 b
"""

# 6) header 带 trailing 函数签名后缀
_DIFF_WITH_TRAILING = """--- a/foo.js
+++ b/foo.js
@@ -1,2 +1,3 @@ module.exports
 a
+x
 b
"""


VALID_DIFF = """--- a/foo.js
+++ b/foo.js
@@ -1,3 +1,4 @@
 line1
+inserted
 line2
 line3
"""


NEW_FILE_DIFF = """--- /dev/null
+++ b/new.js
@@ -0,0 +1,2 @@
+hello
+world
"""


class TestParseDiff:
    def test_valid_diff(self):
        ps = parse_diff(VALID_DIFF)
        assert len(ps) == 1
        assert ps[0].path == "foo.js"

    def test_new_file_diff(self):
        ps = parse_diff(NEW_FILE_DIFF)
        assert ps[0].is_added_file is True

    def test_empty_string_raises(self):
        with pytest.raises(DiffParseError):
            parse_diff("")

    def test_no_hunks_raises(self):
        with pytest.raises(DiffParseError):
            parse_diff("not a diff at all just text")


class TestApplyDiff:
    def test_apply_insertion(self):
        original = "line1\nline2\nline3\n"
        new = apply_diff(VALID_DIFF, original)
        assert new == "line1\ninserted\nline2\nline3\n"

    def test_apply_to_wrong_content_raises(self):
        original = "totally different content"
        with pytest.raises(DiffApplyError):
            apply_diff(VALID_DIFF, original)

    def test_apply_new_file(self):
        new = apply_diff(NEW_FILE_DIFF, "")  # 新文件原始为空
        assert new == "hello\nworld\n"


class TestNormalizeHunkHeaders:
    def test_too_small_header_is_corrected(self):
        out = normalize_hunk_headers(_DIFF_HEADER_TOO_SMALL)
        # source 实际 3 行, target 实际 4 行
        assert "@@ -1,3 +1,4 @@" in out

    def test_too_large_header_is_corrected(self):
        out = normalize_hunk_headers(_DIFF_HEADER_TOO_LARGE)
        # source 实际 2 行, target 实际 3 行
        assert "@@ -1,2 +1,3 @@" in out

    def test_correct_header_unchanged(self):
        out = normalize_hunk_headers(_DIFF_HEADER_CORRECT)
        assert "@@ -1,2 +1,3 @@" in out

    def test_multi_hunk_each_recomputed(self):
        out = normalize_hunk_headers(_DIFF_MULTI_HUNK_SECOND_WRONG)
        # 第一个 hunk: source 2 / target 3
        assert "@@ -1,2 +1,3 @@" in out
        # 第二个 hunk: source 1 / target 3
        assert "@@ -10,1 +10,3 @@" in out

    def test_no_lengths_in_header_get_filled(self):
        out = normalize_hunk_headers(_DIFF_NO_LENGTHS)
        # source 实际 2 行, target 实际 3 行
        assert "@@ -1,2 +1,3 @@" in out

    def test_trailing_suffix_preserved(self):
        out = normalize_hunk_headers(_DIFF_WITH_TRAILING)
        # 重写后保留 ` module.exports` 后缀
        assert "@@ -1,2 +1,3 @@ module.exports" in out

    def test_parse_after_normalize_no_error(self):
        # LLM 输出错长度, 直接 parse 会挂; normalize 后 parse 应通过
        normalized = normalize_hunk_headers(_DIFF_HEADER_TOO_SMALL)
        ps = parse_diff(normalized)
        assert len(ps) == 1

    def test_apply_after_normalize_succeeds(self):
        # end-to-end: LLM diff 错长度, normalize + apply 应能落地
        normalized = normalize_hunk_headers(_DIFF_HEADER_TOO_LARGE)
        new = apply_diff(normalized, "line1\nline2\n")
        assert new == "line1\ninserted\nline2\n"
