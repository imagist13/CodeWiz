"""批量真豆包跑 6 个公开题 Skill, 汇总通过率。

用法：
    ARK_API_KEY=ark-xxx ARK_ENDPOINT=ep-xxx \\
        PYTHONPATH=. .venv/bin/python scripts/smoke_6_skills.py

输出每个 Skill 的 matched/step_events/cost/时间, 最后给 N/6 报告。
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

from app.llm.ark_client import ArkClient
from app.orchestrator.checkpointer import CheckpointerKind, make_checkpointer
from app.orchestrator.graph import build_graph
from app.orchestrator.state import new_state


FIXTURE = Path(__file__).parent.parent / "tests" / "fixtures" / "conduit_mini"


SCENARIOS: List[Tuple[str, str, str]] = [
    ("L1.1", "add_view_count", "给文章加阅读量字段, 每次访问文章详情时累加 1"),
    ("L1.2", "add_popular_tags_badge", "给侧边栏 popular tags 前 5 个标签加视觉打标"),
    ("L1.3", "add_about_me_tab", "个人主页加 about me tab 展示 user bio"),
    ("L1.4", "add_word_count", "文章详情显示字数和预计阅读时间"),
    ("L2.1", "add_cover_image", "文章需要有封面图, 列表和详情都要展示"),
    ("L2.2", "add_comment_like", "评论需要支持点赞功能, 显示点赞数"),
    ("L2.3", "add_article_draft", "支持文章草稿状态, 未发布的草稿不公开"),
    ("L2.4", "add_edited_time", "显示文章最后一次编辑时间"),
]


class StatsLLM:
    """包 ArkClient, 累计 token 与 cost, 不打印详情。"""

    def __init__(self, inner: Any):
        self._inner = inner
        self.calls = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.reasoning_tokens = 0
        self.cost = 0.0
        self.fail_calls = 0

    async def chat(self, messages, temperature=0.0, max_tokens=4096, **metadata):
        self.calls += 1
        try:
            r = await self._inner.chat(
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **metadata,
            )
        except Exception:
            self.fail_calls += 1
            raise
        self.tokens_in += r.tokens_in
        self.tokens_out += r.tokens_out
        self.reasoning_tokens += r.reasoning_tokens
        self.cost += r.cost_cny
        return r


async def run_one(
    label: str,
    expected_skill: str,
    intent: str,
    api_key: str,
    endpoint: str,
    base_url: str,
) -> Dict[str, Any]:
    sandbox = Path(f"/tmp/codewiz-smoke/{expected_skill}")
    if sandbox.exists():
        shutil.rmtree(sandbox)
    sandbox.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(str(FIXTURE), str(sandbox))

    ark = ArkClient(api_key=api_key, endpoint_id=endpoint, base_url=base_url)
    stats = StatsLLM(ark)
    cp = make_checkpointer(CheckpointerKind.MEMORY)
    graph = build_graph(sandbox_root=str(sandbox), llm=stats, checkpointer=cp)

    state = new_state(
        session_id=f"smoke-{expected_skill}",
        repo_clone_path=str(sandbox),
        branch_name=f"feat/{expected_skill.replace('_', '-')}",
        raw_intent=intent,
    )
    config = {"configurable": {"thread_id": f"smoke-{expected_skill}"}}

    t0 = time.time()
    err: str | None = None
    try:
        s1 = await graph.ainvoke(state, config=config)
        await graph.ainvoke(None, config=config)
        s3 = await graph.ainvoke(None, config=config)
        s4 = await graph.ainvoke(None, config=config)
    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        s1 = s3 = s4 = None
    elapsed = time.time() - t0

    if err or not s4:
        return {
            "label": label,
            "expected": expected_skill,
            "matched": None,
            "skill_correct": False,
            "step_events": [],
            "succeeded": 0,
            "total": 0,
            "elapsed_s": elapsed,
            "stats": stats,
            "err": err,
        }

    matched = s1.get("matched_skill")
    events = s3.get("step_events", [])
    succeeded = sum(1 for e in events if e.get("status") == "succeeded")
    return {
        "label": label,
        "expected": expected_skill,
        "matched": matched,
        "skill_correct": matched == expected_skill,
        "step_events": events,
        "succeeded": succeeded,
        "total": len(s3.get("plan_steps", [])),
        "elapsed_s": elapsed,
        "stats": stats,
        "err": None,
    }


def print_report(rows: List[Dict[str, Any]]) -> None:
    print("\n" + "=" * 90)
    print(
        f"{'题号':<6}{'期望 Skill':<22}{'路由':<10}{'step 成功':<14}{'用时':<8}{'¥':<10}"
    )
    print("=" * 90)
    routed = 0
    diff_ok = 0
    for r in rows:
        s = r["stats"]
        match_mark = "✅" if r["skill_correct"] else "❌"
        if r["skill_correct"]:
            routed += 1
        step_str = f"{r['succeeded']}/{r['total']}"
        if r["succeeded"] >= 1:
            diff_ok += 1
        cost_str = f"¥{s.cost:.4f}"
        print(
            f"{r['label']:<6}{r['expected']:<22}{match_mark:<10}"
            f"{step_str:<14}{r['elapsed_s']:>5.0f}s  {cost_str:<10}"
        )
        if r["err"]:
            print(f"      ERR: {r['err']}")
        for e in r["step_events"]:
            if e.get("status") != "succeeded":
                err_str = str(e.get("error") or "")[:80]
                print(f"      ✗ {e['step_id'][:8]} {e.get('status')}: {err_str}")
    print("=" * 90)
    total_cost = sum(r["stats"].cost for r in rows)
    total_calls = sum(r["stats"].calls for r in rows)
    print(
        f"Skill 路由命中: {routed}/{len(rows)}  ·  至少 1 step 出 diff: {diff_ok}/{len(rows)}"
        f"  ·  总 LLM 调用: {total_calls}  ·  总成本: ¥{total_cost:.4f}"
    )


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

    rows = []
    for label, skill, intent in SCENARIOS:
        print(f"\n>>> running {label} ({skill}) ...")
        r = await run_one(label, skill, intent, api_key, endpoint, base_url)
        rows.append(r)
        s = r["stats"]
        print(
            f"<<< {label} done: matched={r['matched']} "
            f"succeeded={r['succeeded']}/{r['total']} "
            f"calls={s.calls} ¥{s.cost:.4f} {r['elapsed_s']:.0f}s"
        )

    print_report(rows)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
