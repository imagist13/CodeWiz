"""Conduit Lint 工具"""

import subprocess
from pathlib import Path

from config import get_conduit_repo_path


def run_eslint(scope: str = "all", fix: bool = False, timeout: int = 60) -> dict:
    """运行 ESLint"""
    repo_path = Path(get_conduit_repo_path())

    if scope == "frontend":
        target = repo_path / "frontend"
    elif scope == "backend":
        target = repo_path / "backend"
    else:
        target = repo_path

    cmd = ["npx", "eslint", "src/", "--format", "json"]
    if fix:
        cmd.append("--fix")

    try:
        result = subprocess.run(
            cmd,
            cwd=str(target),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        import json
        issues = []
        total = 0
        if result.stdout.strip():
            try:
                data = json.loads(result.stdout)
                for f in data:
                    msgs = f.get("messages", [])
                    total += len(msgs)
                    for m in msgs[:5]:
                        issues.append(f"{f.get('filePath', '')}:{m.get('line', 0)} — {m.get('message', '')}")
            except json.JSONDecodeError:
                pass

        return {
            "passed": result.returncode == 0,
            "total_issues": total,
            "top_issues": issues[:10],
            "stdout": result.stdout[-2000:],
            "stderr": result.stderr[-500:],
        }
    except subprocess.TimeoutExpired:
        return {"passed": False, "total_issues": -1, "error": "timeout"}
    except Exception as e:
        return {"passed": False, "total_issues": -1, "error": str(e)}


def run_prettier(fix: bool = False, timeout: int = 60) -> dict:
    """运行 Prettier 格式化检查"""
    repo_path = Path(get_conduit_repo_path())
    cmd = ["npx", "prettier", "--check", "**/*.{js,jsx,ts,tsx,css}"]
    if fix:
        cmd = ["npx", "prettier", "--write", "**/*.{js,jsx,ts,tsx,css}"]

    try:
        result = subprocess.run(
            cmd,
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "passed": result.returncode == 0,
            "stdout": result.stdout[-1000:],
        }
    except subprocess.TimeoutExpired:
        return {"passed": False, "error": "timeout"}
    except Exception as e:
        return {"passed": False, "error": str(e)}
