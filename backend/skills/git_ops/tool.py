"""git_ops — Git 操作工具"""

import json
import subprocess
from pathlib import Path

from engine.tool import register_tool
from skills._common import err


def _run_git(args: list[str], cwd: str) -> dict:
    """运行 git 命令，返回结构化结果"""
    from config import get_conduit_repo_path

    if cwd is None:
        cwd = get_conduit_repo_path()

    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {
            "ok": result.returncode == 0,
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except Exception as e:
        return {"ok": False, "exit_code": -1, "stdout": "", "stderr": str(e)}


def git_status() -> str:
    """查看 Git 工作区状态"""
    from config import get_conduit_repo_path
    repo = get_conduit_repo_path()

    result = _run_git(["status", "--porcelain"], repo)
    if not result["ok"]:
        return err(f"git status 失败: {result['stderr']}")

    lines = result["stdout"].strip().split("\n")
    if not lines or lines == [""]:
        return "工作区干净，无未提交变更"

    return "未提交变更:\n" + "\n".join(f"  {line}" for line in lines if line)


def git_diff(path: str = "") -> str:
    """查看文件变更"""
    from config import get_conduit_repo_path
    repo = get_conduit_repo_path()

    args = ["diff"]
    if path:
        args.append(path)

    result = _run_git(args, repo)
    if not result["ok"]:
        return err(f"git diff 失败: {result['stderr']}")

    diff = result["stdout"]
    if not diff.strip():
        return "无变更"
    return f"变更内容:\n{diff[:5000]}"


def git_commit(message: str) -> str:
    """提交代码（自动 git add 所有变更）"""
    from config import get_conduit_repo_path
    repo = get_conduit_repo_path()

    if not message or len(message.strip()) < 3:
        return err("提交信息不能少于 3 个字符")

    # git add .
    add_result = _run_git(["add", "-A"], repo)
    if not add_result["ok"]:
        return err(f"git add 失败: {add_result['stderr']}")

    # 检查是否有变更
    status = _run_git(["status", "--porcelain"], repo)
    if not status["stdout"].strip():
        return "无变更需要提交"

    # git commit
    commit_result = _run_git(["commit", "-m", message], repo)
    if not commit_result["ok"]:
        return err(f"git commit 失败: {commit_result['stderr']}")

    return f"OK: 提交成功\n{commit_result['stdout']}"


def git_create_branch(name: str, checkout: bool = True) -> str:
    """创建新分支"""
    from config import get_conduit_repo_path
    repo = get_conduit_repo_path()

    if not name or "/" in name or "\\" in name:
        return err("分支名不能包含 / 和 \\")

    result = _run_git(["checkout", "-b", name], repo)
    if not result["ok"]:
        return err(f"创建分支失败: {result['stderr']}")

    return f"OK: 已创建并切换到分支: {name}"


def git_push(remote: str = "origin", branch: str = "") -> str:
    """推送到远程"""
    from config import get_conduit_repo_path
    repo = get_conduit_repo_path()

    # 获取当前分支
    if not branch:
        branch_result = _run_git(["branch", "--show-current"], repo)
        branch = branch_result["stdout"].strip()
        if not branch:
            return err("无法确定当前分支")

    result = _run_git(["push", "-u", remote, branch], repo)
    if not result["ok"]:
        return err(f"推送失败: {result['stderr']}")

    return f"OK: 已推送到 {remote}/{branch}"


def git_log(count: int = 10) -> str:
    """查看最近提交"""
    from config import get_conduit_repo_path
    repo = get_conduit_repo_path()

    result = _run_git(["log", f"--oneline", f"-n{count}"], repo)
    if not result["ok"]:
        return err(f"git log 失败: {result['stderr']}")

    return result["stdout"] or "无提交记录"


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "git_status",
            "description": "查看 Git 工作区状态",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_diff",
            "description": "查看文件变更",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径（可选）"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_commit",
            "description": "提交代码",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "提交信息"},
                },
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_create_branch",
            "description": "创建新分支",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "分支名"},
                    "checkout": {"type": "boolean", "description": "是否切换到新分支", "default": True},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_push",
            "description": "推送到远程",
            "parameters": {
                "type": "object",
                "properties": {
                    "remote": {"type": "string", "description": "远程名", "default": "origin"},
                    "branch": {"type": "string", "description": "分支名（默认当前分支）"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_log",
            "description": "查看最近提交记录",
            "parameters": {
                "type": "object",
                "properties": {
                    "count": {"type": "integer", "description": "显示条数", "default": 10},
                },
            },
        },
    },
]

HANDLERS = {
    "git_status": git_status,
    "git_diff": git_diff,
    "git_commit": git_commit,
    "git_create_branch": git_create_branch,
    "git_push": git_push,
    "git_log": git_log,
}


def register():
    for s in TOOLS:
        name = s["function"]["name"]
        register_tool(s, HANDLERS[name])
