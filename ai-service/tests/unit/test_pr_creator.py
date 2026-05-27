"""PrCreator — 真 branch + commit + gh pr create, 替换 node_pr_creator mock (v3 §D Task 22).

测试纪律: 全部 mock subprocess.run, 不真碰 git / gh。
"""

from __future__ import annotations
import subprocess
from unittest.mock import patch

import pytest

from app.orchestrator.pr_creator import PrCreator


def _mock_run_factory(stdout_by_argv_prefix=None):
    """返一个 stub 替换 subprocess.run。

    stdout_by_argv_prefix: {("git", "format-patch"): "patch content"} 形态。
    """
    calls = []
    mapping = stdout_by_argv_prefix or {}

    def fake_run(argv, *args, **kwargs):
        calls.append({"argv": tuple(argv), "cwd": kwargs.get("cwd"), "kwargs": kwargs})
        stdout = ""
        for prefix, out in mapping.items():
            if tuple(argv[: len(prefix)]) == prefix:
                stdout = out
                break
        return subprocess.CompletedProcess(
            args=argv, returncode=0, stdout=stdout, stderr=""
        )

    fake_run.calls = calls
    return fake_run


class TestStageBranchCommit:
    def test_runs_git_checkout_add_commit_format_patch(self, tmp_path):
        fake = _mock_run_factory({("git", "format-patch"): "PATCH_CONTENT"})
        creator = PrCreator(repo_root=tmp_path, head_repo="team/conduit")

        with patch("subprocess.run", side_effect=fake):
            info = creator.stage_branch_commit(
                skill_name="add_view_count", summary="feat: view count"
            )

        assert info["branch"].startswith("codewiz/add_view_count/")
        assert info["patch"] == "PATCH_CONTENT"

        argv_names = [c["argv"][:2] for c in fake.calls]
        # 必须按 checkout → add → commit → format-patch 顺序
        assert ("git", "checkout") in argv_names
        assert ("git", "add") in argv_names
        assert ("git", "commit") in argv_names
        assert ("git", "format-patch") in argv_names

    def test_runs_in_repo_root_cwd(self, tmp_path):
        fake = _mock_run_factory()
        creator = PrCreator(repo_root=tmp_path, head_repo="team/conduit")
        with patch("subprocess.run", side_effect=fake):
            creator.stage_branch_commit(skill_name="x", summary="s")
        for c in fake.calls:
            assert c["cwd"] == tmp_path


class TestPushAndPr:
    def test_dry_run_returns_marker_no_push(self, tmp_path):
        fake = _mock_run_factory()
        creator = PrCreator(repo_root=tmp_path, head_repo="team/conduit", dry_run=True)
        with patch("subprocess.run", side_effect=fake):
            url = creator.push_and_pr("codewiz/x/123", title="t", body="b")
        assert "dry-run" in url.lower()
        # dry_run 时不应调用 git push / gh
        for c in fake.calls:
            assert c["argv"][0] not in ("git", "gh") or c["argv"][:2] != ("git", "push")

    def test_real_push_uses_gh_pr_create_with_explicit_repo_and_head(self, tmp_path):
        gh_url = "https://github.com/team/conduit/pull/42"
        fake = _mock_run_factory({("gh", "pr", "create"): gh_url})
        creator = PrCreator(
            repo_root=tmp_path,
            head_repo="team/conduit",
            base_repo="team/conduit",
            dry_run=False,
        )
        with patch("subprocess.run", side_effect=fake):
            url = creator.push_and_pr("codewiz/x/123", title="t", body="b")

        assert url == gh_url
        # 验证 git push 和 gh pr create 都被调
        argvs = [c["argv"] for c in fake.calls]
        assert any(a[:2] == ("git", "push") for a in argvs)
        gh_calls = [a for a in argvs if a[:3] == ("gh", "pr", "create")]
        assert len(gh_calls) == 1
        gh = gh_calls[0]
        # 必须含 --repo / --head / --base / --draft
        assert "--repo" in gh
        assert "--head" in gh
        assert "--base" in gh
        assert "--draft" in gh
        # --head 必须是 fork:branch 形式
        head_idx = gh.index("--head")
        assert gh[head_idx + 1] == "team:codewiz/x/123"

    def test_real_push_raises_when_head_repo_missing(self, tmp_path):
        creator = PrCreator(repo_root=tmp_path, head_repo=None, dry_run=False)
        with pytest.raises(RuntimeError, match="head_repo"):
            creator.push_and_pr("br", title="t", body="b")


class TestEnvFallback:
    def test_reads_env_when_args_not_passed(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CODEWIZ_HEAD_REPO", "envteam/conduit")
        monkeypatch.setenv("CODEWIZ_BASE_REPO", "envbase/conduit")
        c = PrCreator(repo_root=tmp_path)
        assert c.head_repo == "envteam/conduit"
        assert c.base_repo == "envbase/conduit"

    def test_base_defaults_to_head_when_unset(self, tmp_path, monkeypatch):
        monkeypatch.delenv("CODEWIZ_BASE_REPO", raising=False)
        c = PrCreator(repo_root=tmp_path, head_repo="x/y")
        assert c.base_repo == "x/y"
