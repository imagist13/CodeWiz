"""真豆包链路冒烟：跑通 PM 输入 → diff 落地的完整 5 节点。

用法：
    ARK_API_KEY=ark-xxx ARK_ENDPOINT=ep-xxx \\
        PYTHONPATH=. .venv/bin/python scripts/smoke_e2e_view_count.py

打印每次 LLM 调用的 reasoning_content + content + token / latency，
最后看 article.js 有没有真被改。
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List

from app.llm.ark_client import ArkClient
from app.orchestrator.checkpointer import CheckpointerKind, make_checkpointer
from app.orchestrator.graph import build_graph
from app.orchestrator.state import new_state


FIXTURE = Path(__file__).parent.parent / "tests" / "fixtures" / "conduit_mini"


class VerboseLLM:
    """包 ArkClient，打印每次调用的 reasoning + content。"""

    def __init__(self, inner: Any):
        self._inner = inner
        self._n = 0

    async def chat(self, messages, temperature=0.0, max_tokens=4096, **metadata):
        self._n += 1
        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        print(f"\n┌── LLM #{self._n}  metadata={metadata}")
        print(f"│  user[-1]: {last_user[:200]}{'...' if len(last_user) > 200 else ''}")
        r = await self._inner.chat(
            messages, temperature=temperature, max_tokens=max_tokens, **metadata
        )
        if r.reasoning_content:
            preview = r.reasoning_content[:300].replace("\n", " ")
            print(f"│  ⚙ reasoning ({r.reasoning_tokens}t): {preview}...")
        content_preview = r.content[:400].replace("\n", "↵")
        print(
            f"│  ✎ content ({r.tokens_out}t, {r.latency_ms}ms, ¥{r.cost_cny:.4f}): "
            f"{content_preview}"
        )
        print("└──")
        return r


def _section(title: str) -> None:
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


def _summarize_state(s: Dict[str, Any]) -> None:
    print(f"  matched_skill   = {s.get('matched_skill')}")
    print(f"  skill_confidence= {s.get('skill_confidence')}")
    print(f"  filled_params   = {s.get('filled_params')}")
    print(f"  plan_steps len  = {len(s.get('plan_steps', []))}")
    print(f"  current_step_idx= {s.get('current_step_idx')}")
    events: List[Dict[str, Any]] = s.get("step_events", [])
    print(f"  step_events len = {len(events)}")
    for e in events:
        sid = e.get("step_id")
        status = e.get("status")
        err = e.get("error")
        print(f"    - {sid:30s} {status:10s}{(' err=' + str(err)[:60]) if err else ''}")
    print(f"  pr_url          = {s.get('pr_url')}")
    print(f"  reflexion       = {(s.get('reflexion_critique') or '')[:120]}")
    print(f"  pending_qs len  = {len(s.get('pending_questions', []))}")


async def main() -> int:
    api_key = os.environ.get("ARK_API_KEY")
    endpoint = os.environ.get("ARK_ENDPOINT")
    base_url = os.environ.get(
        "ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"
    )
    if not api_key or not endpoint:
        print("ERROR: set ARK_API_KEY and ARK_ENDPOINT env vars", file=sys.stderr)
        return 2
    print(f"using base_url={base_url}  model={endpoint}")

    sandbox = Path("/tmp/codewiz-smoke/conduit")
    if sandbox.exists():
        shutil.rmtree(sandbox)
    sandbox.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(str(FIXTURE), str(sandbox))
    print(f"sandbox = {sandbox}")

    ark = ArkClient(api_key=api_key, endpoint_id=endpoint, base_url=base_url)
    llm = VerboseLLM(ark)
    cp = make_checkpointer(CheckpointerKind.MEMORY)
    graph = build_graph(sandbox_root=str(sandbox), llm=llm, checkpointer=cp)

    state = new_state(
        session_id="smoke-1",
        repo_clone_path=str(sandbox),
        branch_name="feat/add-view-count",
        raw_intent="给文章加阅读量字段，每次访问文章详情时累加 1",
    )
    config = {"configurable": {"thread_id": "smoke-1"}}

    _section("Segment 1: clarify → router → slot_check  (stop before plan_builder)")
    s1 = await graph.ainvoke(state, config=config)
    _summarize_state(s1)

    _section("Segment 2: plan_builder  (stop before step_executor)")
    s2 = await graph.ainvoke(None, config=config)
    _summarize_state(s2)

    _section("Segment 3: step_executor → verify  (stop before pr_creator)")
    s3 = await graph.ainvoke(None, config=config)
    _summarize_state(s3)

    article_js = sandbox / "backend/db/models/article.js"
    print("\n--- article.js (HEAD 30 lines) ---")
    if article_js.exists():
        for i, line in enumerate(article_js.read_text().splitlines()[:30], 1):
            print(f"  {i:3d}: {line}")
        print(
            f"viewCount in file? "
            f"{'YES' if 'viewCount' in article_js.read_text() else 'NO'}"
        )

    _section("Segment 4: pr_creator → END")
    s4 = await graph.ainvoke(None, config=config)
    _summarize_state(s4)

    _section("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
