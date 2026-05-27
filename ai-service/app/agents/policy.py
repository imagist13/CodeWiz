"""policy.py — 在 dispatch_tool 之上加 denylist 写拦截 + bashTool 白名单 (v3 Task 20).

Contract / Tool / Prompt / Acceptance 分层中本模块属于"工具硬约束"层。
即使 LLM 受 prompt 引导越界, 这里也会硬拦。

设计:
- 写工具集 (writeFileTool / replaceInFileTool / appendToFileTool /
  makeDirectoryTool / movePathTool / deletePathTool) 的 path 参数走 denylist
- bashTool 的 command 走白名单 (npm test / build -w frontend / git diff / status / log)
- 其他工具 (读 / 沙箱 / SSE) 透传, 不拦
- 命中拦截 → 返 ToolResult(is_error=True, result="ForbiddenPath: ...")

policy_dispatch 用关键字 _dispatch 注入底层 dispatch_tool 便于单测。
"""

from __future__ import annotations
import fnmatch
import shlex
from typing import Any, Callable, Dict, List, Optional

from app.harness.tools import ToolResult, dispatch_tool as _real_dispatch


__all__ = ["policy_dispatch", "DenyReason"]


# 写工具 → 哪些参数键值是 "路径" (需要走 denylist)。
WRITE_TOOLS_PATH_KEYS: Dict[str, List[str]] = {
    "writeFileTool": ["file"],
    "replaceInFileTool": ["file"],
    "appendToFileTool": ["file"],
    "makeDirectoryTool": ["path"],
    "movePathTool": ["from", "to", "from_path", "to_path"],
    "deletePathTool": ["path"],
}


# 禁止写入的路径模式 (fnmatch 风格)。
_DENYLIST_PATTERNS: tuple[str, ...] = (
    ".git",
    ".git/*",
    "**/.git",
    "**/.git/*",
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "**/package.json",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
)


# bashTool 白名单 — 命令第一段必须以这些为开头, 且参数受限。
# 用 tuple 表达 "argv 前缀必须等于"。
_BASH_ARGV_PREFIXES: tuple[tuple[str, ...], ...] = (
    ("npm", "test"),
    ("npm", "run", "test"),
    ("npm", "test", "-w", "backend"),
    ("npm", "test", "-w", "frontend"),
    ("npm", "run", "build", "-w", "frontend"),
    ("git", "diff"),
    ("git", "status"),
    ("git", "log"),
    ("git", "rev-parse"),
    ("git", "branch"),
    ("git", "show"),
)


# 任何 shell metachar 都拒绝, 防止 prefix 通过后挂尾巴。
_SHELL_METACHARS: tuple[str, ...] = (
    ";",
    "&&",
    "||",
    "|",
    ">",
    "<",
    "$(",
    "`",
    "&",
)


class DenyReason:
    PATH_DENIED = "ForbiddenPath"
    BASH_NOT_WHITELISTED = "Bash command not in whitelist"
    BASH_SHELL_METACHAR = "Bash command contains shell metachar"


def _path_denied(path: str) -> bool:
    p = path.replace("\\", "/")
    return any(fnmatch.fnmatch(p, pat) for pat in _DENYLIST_PATTERNS)


def _check_write_paths(tool_name: str, args: Dict[str, Any]) -> Optional[str]:
    """返 None 通过, 返错误消息阻断。"""
    keys = WRITE_TOOLS_PATH_KEYS.get(tool_name)
    if not keys:
        return None
    for k in keys:
        v = args.get(k)
        if isinstance(v, str) and _path_denied(v):
            return f"{DenyReason.PATH_DENIED}: write to {v!r} blocked by sandbox policy"
    return None


def _check_bash_command(command: str) -> Optional[str]:
    if not isinstance(command, str) or not command.strip():
        return f"{DenyReason.BASH_NOT_WHITELISTED}: empty"
    # 先查 shell metachar
    for m in _SHELL_METACHARS:
        if m in command:
            return f"{DenyReason.BASH_SHELL_METACHAR}: {m!r} in {command!r}"
    # 再 shlex 切, 必须匹配某个 argv 前缀
    try:
        argv = tuple(shlex.split(command))
    except ValueError as e:
        return f"{DenyReason.BASH_NOT_WHITELISTED}: shlex parse error {e}"
    if not argv:
        return f"{DenyReason.BASH_NOT_WHITELISTED}: empty argv"
    for prefix in _BASH_ARGV_PREFIXES:
        if argv[: len(prefix)] == prefix:
            return None
    return f"{DenyReason.BASH_NOT_WHITELISTED}: {argv!r}"


def policy_dispatch(
    tool_name: str,
    tool_call_id: str,
    arguments: Any,
    *,
    _dispatch: Optional[Callable[..., ToolResult]] = None,
) -> ToolResult:
    """在 dispatch_tool 之上加策略层。

    Args:
        tool_name: 工具名
        tool_call_id: OpenAI tool_call id
        arguments: dict 或 JSON 字符串
        _dispatch: 注入底层 dispatch (默认真 dispatch_tool, 测试时传 stub)

    Returns:
        ToolResult — 拦截时 is_error=True, 否则透传底层结果。
    """
    if _dispatch is None:
        _dispatch = _real_dispatch

    # arguments 可能是 str (JSON), 这里只在需要检查时尝试解析
    args_dict: Dict[str, Any] = {}
    if isinstance(arguments, dict):
        args_dict = arguments
    elif isinstance(arguments, str):
        import json

        try:
            parsed = json.loads(arguments)
            if isinstance(parsed, dict):
                args_dict = parsed
        except json.JSONDecodeError:
            args_dict = {}

    # 写工具: denylist
    deny_msg = _check_write_paths(tool_name, args_dict)
    if deny_msg:
        return ToolResult(
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            result=deny_msg,
            is_error=True,
        )

    # bashTool: 白名单 + metachar
    if tool_name == "bashTool":
        cmd = args_dict.get("command", "")
        deny_msg = _check_bash_command(cmd)
        if deny_msg:
            return ToolResult(
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                result=deny_msg,
                is_error=True,
            )

    # 透传
    return _dispatch(tool_name, tool_call_id, arguments)
