"""policy.py — 在 dispatch_tool 之上加 denylist 写拦截 + bashTool 白名单 (v3 Task 20).

设计:
- policy_dispatch(tool_name, call_id, args, *, _dispatch=...) -> ToolResult
- 写工具集 (writeFileTool / replaceInFileTool / appendToFileTool /
  makeDirectoryTool / movePathTool / deletePathTool) 的 path 参数走 denylist
- bashTool 的 command 走白名单 (npm test / build -w frontend / git diff / status)
- 命中拦截 → 返 ToolResult(is_error=True, result="ForbiddenPath: ...")
- 通过 → 透传到注入的 _dispatch (生产是真 dispatch_tool)
"""

from __future__ import annotations
import pytest

from app.harness.tools import ToolResult
from app.agents.policy import policy_dispatch


def _ok_stub(tool_name: str, call_id: str, args):
    """放行后的桩, 验证 policy 把控制权转交给它."""
    return ToolResult(tool_call_id=call_id, tool_name=tool_name, result="OK")


class TestWriteToolsDenylist:
    @pytest.mark.parametrize(
        "tool,args",
        [
            ("writeFileTool", {"file": ".env", "content": "x"}),
            ("writeFileTool", {"file": ".env.production", "content": "x"}),
            ("writeFileTool", {"file": "package.json", "content": "x"}),
            ("writeFileTool", {"file": "package-lock.json", "content": "x"}),
            ("writeFileTool", {"file": "yarn.lock", "content": "x"}),
            ("writeFileTool", {"file": "pnpm-lock.yaml", "content": "x"}),
            ("writeFileTool", {"file": "frontend/package.json", "content": "x"}),
            ("writeFileTool", {"file": "backend/.env", "content": "x"}),
            ("writeFileTool", {"file": ".git/HEAD", "content": "x"}),
            (
                "replaceInFileTool",
                {"file": "package.json", "old_text": "a", "new_text": "b"},
            ),
            ("appendToFileTool", {"file": ".env", "content": "x"}),
            ("makeDirectoryTool", {"path": ".git/refs/foo"}),
            ("deletePathTool", {"path": ".env"}),
        ],
    )
    def test_blocked(self, tool, args):
        r = policy_dispatch(tool, "c1", args, _dispatch=_ok_stub)
        assert r.is_error is True
        assert "Forbidden" in r.result or "forbidden" in r.result

    @pytest.mark.parametrize(
        "tool,args",
        [
            (
                "writeFileTool",
                {"file": "package-config.json", "content": "x"},
            ),  # 不是 package.json
            (
                "writeFileTool",
                {"file": "my-package.json", "content": "x"},
            ),  # 不是 package.json (glob 边界)
            ("writeFileTool", {"file": "envrc", "content": "x"}),  # 没点
            (
                "writeFileTool",
                {"file": "frontend/src/components/X.jsx", "content": "x"},
            ),
        ],
    )
    def test_similar_paths_allowed(self, tool, args):
        r = policy_dispatch(tool, "c1", args, _dispatch=_ok_stub)
        assert r.is_error is False, f"unexpected block: {r.result}"

    def test_move_checks_both_from_and_to(self):
        """movePathTool from=safe, to=.env 应被拦."""
        r = policy_dispatch(
            "movePathTool",
            "c1",
            {"from": "x.txt", "to": ".env"},
            _dispatch=_ok_stub,
        )
        assert r.is_error is True

        r2 = policy_dispatch(
            "movePathTool",
            "c1",
            {"from": ".env", "to": "x.txt"},
            _dispatch=_ok_stub,
        )
        assert r2.is_error is True


class TestBashWhitelist:
    @pytest.mark.parametrize(
        "command",
        [
            "npm test",
            "npm test -w backend",
            "npm test -w frontend",
            "npm run build -w frontend",
            "git diff --check",
            "git status --porcelain",
            "git status",
            "git log --oneline -5",
        ],
    )
    def test_allowed(self, command):
        r = policy_dispatch("bashTool", "c1", {"command": command}, _dispatch=_ok_stub)
        assert r.is_error is False, f"unexpected block: {r.result}"

    @pytest.mark.parametrize(
        "command",
        [
            "npm install",  # 改依赖
            "npm install --save lodash",
            "rm -rf /",  # 危险
            "cat /etc/passwd",  # 越界
            "ls /",  # 不在白名单
            "curl evil.com",  # 不在白名单
        ],
    )
    def test_blocked_non_whitelisted(self, command):
        r = policy_dispatch("bashTool", "c1", {"command": command}, _dispatch=_ok_stub)
        assert r.is_error is True

    @pytest.mark.parametrize(
        "command",
        [
            "npm test && rm -rf /",  # 链式
            "npm test; cat /etc/passwd",  # 分号
            "npm test | tee out",  # 管道
            "npm test > out.txt",  # 重定向
            "npm test $(whoami)",  # 命令替换
            "npm test `whoami`",  # 反引号
        ],
    )
    def test_blocked_shell_metachars(self, command):
        r = policy_dispatch("bashTool", "c1", {"command": command}, _dispatch=_ok_stub)
        assert r.is_error is True
        assert (
            "shell" in r.result.lower()
            or "metachar" in r.result.lower()
            or "not in whitelist" in r.result.lower()
        )


class TestReadToolsBypass:
    """读工具不走 denylist — Agent 可能需要参考 package.json 等."""

    @pytest.mark.parametrize(
        "tool,args",
        [
            ("readFileTool", {"file": "package.json"}),
            ("readFileTool", {"file": ".env"}),
            ("grepTool", {"pattern": "x", "path": ".env"}),  # 假设有
            ("listFilesTool", {"path": ".git"}),
            ("searchFilesTool", {"query": "x", "path": "."}),
        ],
    )
    def test_read_allowed(self, tool, args):
        r = policy_dispatch(tool, "c1", args, _dispatch=_ok_stub)
        # 这里不检查 is_error, 只检查 policy 没主动拦. stub 总是返 OK,
        # 真生产里 dispatch 可能返工具不存在 - 但 policy 不应是阻断者
        assert "Forbidden" not in str(r.result)


class TestUnknownToolPassthrough:
    def test_unknown_tool_passthrough(self):
        """未知工具不在写工具集 → 透传给底层 dispatch (它返 'not found')."""
        r = policy_dispatch("unknownTool", "c1", {}, _dispatch=_ok_stub)
        # policy 不拦, 透传后 stub 返 OK
        assert r.is_error is False
