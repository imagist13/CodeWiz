"""真 Conduit + 真 LLM e2e: L1-A contract → ExploreEditAgent → PR draft (v3 §E Task 19+18).

Day 1 spike: 验证 DeepSeek tool_calling 在真 Conduit 上跑通 contract_l1a。
Day 5 里程碑: 这个测试绿即 §A-§E 全链路 ok, 答辩主 demo 路径打通。

跳过条件 (CI 默认全 skip):
  - ARK_API_KEY 未设
  - ARK_ENDPOINT 未设
  - ai-service/external/conduit_real/.git 不存在 (没跑 setup_conduit_real.sh)

本地跑:
  export ARK_API_KEY=<key>
  export ARK_ENDPOINT=deepseek-chat
  export ARK_BASE_URL=https://api.deepseek.com
  bash ai-service/scripts/setup_conduit_real.sh
  pytest tests/integration/test_contract_e2e_view_count_real.py -v -s

不会 push 真 PR (node_pr_creator 默认 dry_run=True);
要真推: export CODEWIZ_HEAD_REPO=<team>/conduit-realworld-example-app + CODEWIZ_PR_DRY_RUN=false
"""

from __future__ import annotations
import os
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
CONDUIT = REPO_ROOT / "external" / "conduit_real"

_SKIP_REASON: list[str] = []
if not os.environ.get("ARK_API_KEY"):
    _SKIP_REASON.append("ARK_API_KEY 未设")
if not os.environ.get("ARK_ENDPOINT"):
    _SKIP_REASON.append("ARK_ENDPOINT 未设")
if not (CONDUIT / ".git").exists():
    _SKIP_REASON.append(
        "external/conduit_real 未 clone (跑 scripts/setup_conduit_real.sh)"
    )

pytestmark = pytest.mark.skipif(
    bool(_SKIP_REASON), reason="; ".join(_SKIP_REASON) or "real LLM e2e gated"
)


@pytest.fixture(scope="module")
def clean_conduit():
    """每次测前 reset 真 Conduit 到干净状态."""
    subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=CONDUIT, check=False)
    subprocess.run(
        ["git", "clean", "-fd", "-e", "node_modules"], cwd=CONDUIT, check=False
    )
    yield
    subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=CONDUIT, check=False)


async def test_l1a_view_count_on_real_conduit(clean_conduit):
    """L1-A: 纯前端 viewCount → ArticleEditorForm.jsx 必须无渗入."""
    from app.agents.explore_edit_agent import ExploreEditAgent
    from app.llm.ark_client import ArkClient
    from app.harness.tools import get_tools, set_current_context
    from app.skills.business.add_view_count import AddViewCountSkill

    # 把 harness sandbox 指向真 Conduit (writeFileTool 等改这里的文件)
    set_current_context(repo_id=str(CONDUIT), token=None)

    llm = ArkClient.from_env()
    agent = ExploreEditAgent(
        llm=llm,
        repo_root=CONDUIT,
        tools_schema=get_tools(),
        max_iters=15,
    )

    contract = AddViewCountSkill().contract_l1a()
    result = await agent.run(contract)

    failed = [(r.check, r.detail) for r in result.acceptance if not r.ok]
    assert result.ok, f"acceptance failed: {failed}"
    assert len(result.diff_files) >= 1, "agent 至少要改一个文件"
    # 真 Conduit 路径 sanity: diff 应在 frontend/src 下
    assert any("frontend/src" in p or "frontend\\src" in p for p in result.diff_files)
