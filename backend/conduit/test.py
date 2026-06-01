"""Conduit Test 工具"""

import subprocess
import json
from pathlib import Path

from config import get_conduit_repo_path


def run_vitest(scope: str = "all", test_file: str = "", timeout: int = 120) -> dict:
    """运行 Vitest"""
    repo_path = Path(get_conduit_repo_path())

    if scope == "frontend":
        target = repo_path / "frontend"
    elif scope == "backend":
        target = repo_path / "backend"
    else:
        target = repo_path

    cmd = ["npx", "vitest", "run"]
    if test_file:
        cmd.append(test_file)

    try:
        result = subprocess.run(
            cmd,
            cwd=str(target),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return _parse_vitest_output(result.stdout, result.stderr, result.returncode)
    except subprocess.TimeoutExpired:
        return {"passed": False, "error": "timeout", "elapsed_ms": timeout * 1000}
    except Exception as e:
        return {"passed": False, "error": str(e)}


def _parse_vitest_output(stdout: str, stderr: str, exit_code: int) -> dict:
    """解析 Vitest 输出"""
    passed = exit_code == 0

    # 尝试从 JSON 提取
    import re
    json_blocks = re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", stdout, re.DOTALL)
    for block in reversed(json_blocks):
        try:
            data = json.loads(block)
            if "testResults" in data or "summary" in data or "results" in data:
                tests = data.get("testResults", data.get("results", []))
                passed_count = sum(r.get("assertionResults", []) for r in tests)
                return {
                    "passed": passed,
                    "tests": tests,
                    "stdout": stdout[-3000:],
                }
        except json.JSONDecodeError:
            continue

    # 简单文本解析
    passed_match = re.search(r"(\d+)\s+passed", stdout)
    failed_match = re.search(r"(\d+)\s+failed", stdout)
    passed_count = int(passed_match.group(1)) if passed_match else 0
    failed_count = int(failed_match.group(1)) if failed_match else 0

    return {
        "passed": passed,
        "passed_count": passed_count,
        "failed_count": failed_count,
        "stdout": stdout[-3000:],
        "stderr": stderr[-500:],
    }
