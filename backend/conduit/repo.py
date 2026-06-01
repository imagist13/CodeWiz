"""ConduitRepo — Conduit 仓库操作封装"""

import subprocess
from pathlib import Path
from typing import Optional

from config import get_conduit_repo_path


class ConduitRepo:
    """Conduit 仓库操作接口"""

    def __init__(self, repo_path: str | None = None):
        self.repo_path = Path(repo_path or get_conduit_repo_path())

    def exists(self) -> bool:
        return self.repo_path.exists() and (self.repo_path / ".git").exists()

    def current_branch(self) -> str:
        try:
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=str(self.repo_path),
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.stdout.strip()
        except Exception:
            return "unknown"

    def create_branch(self, name: str) -> str:
        try:
            result = subprocess.run(
                ["git", "checkout", "-b", name],
                cwd=str(self.repo_path),
                capture_output=True,
                text=True,
                timeout=30,
            )
            return "OK" if result.returncode == 0 else result.stderr
        except Exception as e:
            return str(e)

    def git_status(self) -> str:
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=str(self.repo_path),
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.stdout.strip() or "工作区干净"
        except Exception as e:
            return str(e)

    def install_deps(self) -> str:
        """安装 npm 依赖"""
        try:
            result = subprocess.run(
                ["npm", "install"],
                cwd=str(self.repo_path),
                capture_output=True,
                text=True,
                timeout=300,
            )
            return f"exit={result.returncode}\n{result.stdout[-1000:]}"
        except Exception as e:
            return str(e)
