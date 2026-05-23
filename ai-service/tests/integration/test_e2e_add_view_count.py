import json
import shutil
from pathlib import Path

from app.orchestrator.graph import build_graph
from app.orchestrator.state import new_state
from app.orchestrator.checkpointer import (
    make_checkpointer,
    CheckpointerKind,
)
from app.agents.llm_protocol import FakeLLM


FIXTURE = Path(__file__).parent.parent / "fixtures" / "conduit_mini"


# 复用 tests/unit/test_step_executor.py 里已验证通过的 _MODEL_DIFF
# (注意: header 只用 "@@ -13,4 +13,5 @@", 不带尾部注释)
_DIFF_MODEL = """--- a/backend/db/models/article.js
+++ b/backend/db/models/article.js
@@ -13,4 +13,5 @@
     description: { type: DataTypes.STRING, allowNull: false },
     body: { type: DataTypes.TEXT, allowNull: false },
     slug: { type: DataTypes.STRING, unique: true },
+    viewCount: { type: DataTypes.INTEGER, defaultValue: 0 },
   }, {
"""


async def test_full_pipeline_add_view_count(tmp_path):
    sandbox = tmp_path / "conduit"
    shutil.copytree(str(FIXTURE), str(sandbox))

    # FakeLLM 顺序响应:
    # 1. clarify 复述理解
    # 2. clarify 反思 (JSON)
    # 3. edit_sequelize_model 的真 diff (会落地)
    # 4-N. 后续 step 故意喂无效 diff, 进 DiffParseError 分支被 step_executor
    #      捕获并 fail (记入 step_events), 不会炸整张图。
    # 注: gen_migration 类 step 的 target_path 是目录 (codemap 限制),
    #     即便给合法 new-file diff 也会撞 IsADirectoryError, 所以直接走失败分支。
    # 每个 step 最多 max_retries(1)+1 = 2 次 LLM 调用, 9 个 step 留足 20 个。
    canned = [
        "用户想给 Article 加 viewCount 字段",
        json.dumps({"questions": []}),
        _DIFF_MODEL,  # edit_sequelize_model (succeeds)
    ] + ["not a diff"] * 30  # 余下 step 故意失败, 验证 step_events 记错

    llm = FakeLLM(canned=canned)
    cp = make_checkpointer(CheckpointerKind.MEMORY)
    graph = build_graph(sandbox_root=str(sandbox), llm=llm, checkpointer=cp)

    state = new_state(
        session_id="e2e-1",
        repo_clone_path=str(sandbox),
        branch_name="feat/add-view-count",
        raw_intent="给文章加阅读量",
    )
    config = {"configurable": {"thread_id": "e2e-1"}}

    # 第 1 段: 跑到 plan_builder 前停 (interrupt)
    s1 = await graph.ainvoke(state, config=config)
    assert s1["matched_skill"] == "add_view_count"
    assert s1["filled_params"] == {"default": 0}
    assert s1["plan_steps"] == []  # plan_builder 还没跑

    # 第 2 段: 继续, 走过 plan_builder 后停 (interrupt step_executor 前)
    s2 = await graph.ainvoke(None, config=config)
    assert len(s2["plan_steps"]) >= 9

    # 第 3 段: 继续跑 step loop + verify + 停在 pr_creator 前
    s3 = await graph.ainvoke(None, config=config)
    # 至少前 1 个 step 跑成功 (edit_sequelize_model)
    succeeded = [e for e in s3["step_events"] if e["status"] == "succeeded"]
    assert len(succeeded) >= 1
    article_js = (sandbox / "backend/db/models/article.js").read_text()
    assert "viewCount" in article_js
    assert s3.get("pr_url") is None  # 还没到 pr_creator

    # 第 4 段: 跑 pr_creator → END
    s4 = await graph.ainvoke(None, config=config)
    assert s4["pr_url"] is not None
    assert "feat/add-view-count" in s4["pr_url"] or "add_view_count" in s4["pr_url"]
