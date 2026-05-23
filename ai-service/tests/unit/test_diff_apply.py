import pytest
from app.harness.diff_apply import (
    parse_diff,
    apply_diff,
    DiffParseError,
    DiffApplyError,
)


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
