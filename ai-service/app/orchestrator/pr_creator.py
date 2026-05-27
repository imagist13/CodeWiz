"""PrCreator — 真 branch + commit + gh pr create (v3 §D Task 22).

替换 node_pr_creator 旧 mock URL 行为。

用法:
  creator = PrCreator(repo_root="/path/to/conduit_real",
                      head_repo="team/conduit",  # 或读 CODEWIZ_HEAD_REPO env
                      base_repo=None,            # 默认等于 head_repo
                      dry_run=False)
  info = creator.stage_branch_commit(skill_name="add_view_count",
                                      summary="feat: viewCount")
  pr_url = creator.push_and_pr(info["branch"], title="...", body="...")

dry_run=True 时只跑 git commit + format-patch, 不 push, 不 gh pr create,
返回 (dry-run) marker URL, 用于本地演示 / demo 录制时不污染远程。
"""

from __future__ import annotations
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


class PrCreator:
    def __init__(
        self,
        repo_root: Any,  # str | Path
        *,
        dry_run: bool = False,
        head_repo: Optional[str] = None,
        base_repo: Optional[str] = None,
        base_branch: str = "main",
    ):
        self.repo = Path(repo_root)
        self.dry_run = dry_run
        self.head_repo = head_repo or os.environ.get("CODEWIZ_HEAD_REPO")
        self.base_repo = (
            base_repo or os.environ.get("CODEWIZ_BASE_REPO") or self.head_repo
        )
        self.base_branch = base_branch

    def _run(self, argv: list) -> subprocess.CompletedProcess:
        return subprocess.run(
            argv, cwd=self.repo, capture_output=True, text=True, check=True
        )

    def stage_branch_commit(self, *, skill_name: str, summary: str) -> Dict[str, Any]:
        """新建 branch + add + commit + format-patch, 返回 {branch, patch}."""
        branch = (
            f"codewiz/{skill_name}/"
            f"{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
        )
        self._run(["git", "checkout", "-b", branch])
        self._run(["git", "add", "-A"])
        self._run(["git", "commit", "-m", summary])
        patch = self._run(["git", "format-patch", "-1", "--stdout"]).stdout
        return {"branch": branch, "patch": patch}

    def push_and_pr(self, branch: str, *, title: str, body: str) -> str:
        """推送 branch + gh pr create --draft, 返 PR URL。

        dry_run=True 时不实际推送, 返带 (dry-run) marker 的描述字符串。
        """
        if self.dry_run:
            return f"(dry-run) PR would be created on branch {branch}; patch only"
        if not self.head_repo:
            raise RuntimeError(
                "head_repo or CODEWIZ_HEAD_REPO must be set; "
                "setup_conduit_real.sh should have configured 'origin' to your team fork."
            )
        # push 到 origin (由 setup_conduit_real.sh 指向 fork)
        self._run(["git", "push", "-u", "origin", branch])
        # gh pr create 显式 --repo / --head fork:branch 避免 cwd 漂移
        head_owner = self.head_repo.split("/")[0]
        argv = [
            "gh",
            "pr",
            "create",
            "--repo",
            self.base_repo or self.head_repo,
            "--head",
            f"{head_owner}:{branch}",
            "--base",
            self.base_branch,
            "--title",
            title,
            "--body",
            body,
            "--draft",
        ]
        proc = self._run(argv)
        return proc.stdout.strip()
