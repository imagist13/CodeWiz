"""test_runner — 测试执行工具"""

import json
import subprocess
import time
from pathlib import Path

from engine.tool import register_tool
from skills._common import err, check_dangerous_command


def run_tests(
    scope: str = "all",
    test_file: str = "",
    timeout: int = 120,
) -> str:
    """运行 vitest 测试"""
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())

    if scope == "frontend":
        target = repo_path / "frontend"
    elif scope == "backend":
        target = repo_path / "backend"
    else:
        target = repo_path

    cmd_parts = ["npx", "vitest", "run"]
    if test_file:
        cmd_parts.append(test_file)

    cmd_str = " ".join(cmd_parts)

    danger = check_dangerous_command(cmd_str)
    if danger:
        return err(danger)

    start = time.time()
    try:
        result = subprocess.run(
            cmd_parts,
            cwd=str(target),
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        elapsed = int((time.time() - start) * 1000)

        output = result.stdout[:5000] + (result.stdout[5000:] and "...(截断)")

        return json.dumps({
            "passed": result.returncode == 0,
            "exit_code": result.returncode,
            "elapsed_ms": elapsed,
            "stdout": output,
            "stderr": result.stderr[:2000],
        }, ensure_ascii=False, indent=2)

    except subprocess.TimeoutExpired:
        return err(f"测试超时（{timeout}s）")
    except Exception as e:
        return err(f"测试执行失败: {e}")


def check_lint(
    scope: str = "all",
    fix: bool = False,
    timeout: int = 60,
) -> str:
    """运行 ESLint 检查"""
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())

    if scope == "frontend":
        target = repo_path / "frontend"
    elif scope == "backend":
        target = repo_path / "backend"
    else:
        target = repo_path

    cmd_parts = ["npx", "eslint", "src/", "--format", "json"]
    if fix:
        cmd_parts.append("--fix")

    start = time.time()
    try:
        result = subprocess.run(
            cmd_parts,
            cwd=str(target),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed = int((time.time() - start) * 1000)

        if result.stdout.strip():
            try:
                issues = json.loads(result.stdout)
                total_issues = sum(len(f.get("messages", [])) for f in issues)
                return json.dumps({
                    "passed": result.returncode == 0,
                    "total_issues": total_issues,
                    "elapsed_ms": elapsed,
                    "files": [
                        {"file": f["filePath"], "issues": len(f.get("messages", []))}
                        for f in issues if f.get("messages")
                    ],
                }, ensure_ascii=False, indent=2)
            except json.JSONDecodeError:
                pass

        return json.dumps({
            "passed": result.returncode == 0,
            "exit_code": result.returncode,
            "elapsed_ms": elapsed,
            "stdout": result.stdout[:2000],
            "stderr": result.stderr[:1000],
        }, ensure_ascii=False)

    except subprocess.TimeoutExpired:
        return err(f"ESLint 超时（{timeout}s）")
    except Exception as e:
        return err(f"ESLint 执行失败: {e}")


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_tests",
            "description": "运行 vitest 测试",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {"type": "string", "description": "测试范围: all/frontend/backend", "enum": ["all", "frontend", "backend"], "default": "all"},
                    "test_file": {"type": "string", "description": "指定测试文件路径（可选）"},
                    "timeout": {"type": "integer", "description": "超时秒数", "default": 120},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_lint",
            "description": "运行 ESLint 代码检查",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {"type": "string", "description": "检查范围: all/frontend/backend", "enum": ["all", "frontend", "backend"], "default": "all"},
                    "fix": {"type": "boolean", "description": "是否自动修复", "default": False},
                    "timeout": {"type": "integer", "description": "超时秒数", "default": 60},
                },
            },
        },
    },
]

HANDLERS = {
    "run_tests": run_tests,
    "check_lint": check_lint,
}


def register():
    for s in TOOLS:
        name = s["function"]["name"]
        register_tool(s, HANDLERS[name])
