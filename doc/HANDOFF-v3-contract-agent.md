# 交接文档：v3 Contract + ExploreEditAgent

> 分支：`feat/contract-agent` · 7 commits · 338 tests passing + 2 skipped (real-LLM gated)
> **Review PR：https://github.com/YIKUAIBANZI/CodeWiz/pull/1**（base `feat/agents-skills`，正常 PR，待 review 对齐 Q1 后再合并）
> 范围：在 `feat/agents-skills` (PR #6) 基础上加 editing 模式 — 让 PM 在 Conduit 实仓上做最小变更并出真 PR
> 关系：**不替换**旧 Skill plan() 路径，双路径并存；旧 7 Skill 不动，先用 `add_view_count` 验证新架构

---

## 1. 一句话：我们做了啥

把 Skill 从「出 9 个固定 Step 给 step_executor 跑」**演化**成「声明任务+验收清单，让 ExploreEditAgent 自己探索仓库改代码」：

- **SkillContract 五字段**（goal/constraints/forbid/acceptance/candidate_symbols）替代 plan() 出 Step
- **ExploreEditAgent 主循环** 接 OpenAI tool-calling 协议，复用平台 14 工具（writeFileTool / readFileTool / bashTool / ...），不自造
- **policy.py 工具硬约束** 装饰 dispatch_tool：denylist 拦 `.env/.git/package.json/lockfile`，bashTool 走 argv 白名单 + 拒绝 shell metachar
- **prompts/explore_edit.py** 4 个 prompt 常量独立模块（system / contract / acceptance_failure / tool_error_recovery），可版本化可测试
- **graph.py 双路径分叉**：router → slot_check → load_contract → conditional：contract 非 None 走 explore_edit，否则走旧 plan_builder。**interrupt_before 复用地基机制**，没新造 gates.py
- **PrCreator** 替换 node_pr_creator mock URL：真 git branch + commit + format-patch + `gh pr create --draft`（默认 dry_run）
- **JsonlTracer** 主链路 4 类事件 (contract_loaded / diff_summary / acceptance / pr_created) 一行一事件落 `logs/trace.jsonl`

设计纪律：**Contract / Tool / Prompt / Acceptance / run_cmd / Trace 六层分工**，prompt 不替代工具层（denylist 在 FsTools 硬拦），可观测在 trace（不在业务代码里 print）。

---

## 2. 新增 / 修改文件

```
ai-service/app/
├── skills/
│   ├── contract.py                ✨ SkillContract Pydantic 五字段
│   ├── acceptance.py              ✨ FileContains / ForbidContains / GrepInDir
│   ├── base.py                    ⤴ BusinessSkill 加 contract() 默认 None
│   └── business/add_view_count.py ⤴ 加 contract_l1a (纯前端) + contract_l1b (跨栈含 migration)
├── agents/
│   ├── prompts/
│   │   ├── __init__.py            ✨
│   │   └── explore_edit.py        ✨ 4 个 prompt 常量
│   ├── policy.py                  ✨ denylist + bashTool 白名单装饰 dispatch_tool
│   ├── explore_edit_agent.py      ✨ 主循环 (~190 行)
│   └── llm_protocol.py            ⤴ 加 ToolCall + LLMResponse.tool_calls + LLMClient.chat tools= 参数
├── llm/ark_client.py              ⤴ chat 接 tools= 字段 + 解析 message.tool_calls + classmethod from_env
├── orchestrator/
│   ├── state.py                   ⤴ TypedDict 加 4 字段 (skill_contract / acceptance_results / pending_diff / trace_id)
│   ├── nodes.py                   ⤴ 加 node_load_contract / node_explore_edit / node_trace；重写 node_pr_creator (env 切真 PR)
│   ├── graph.py                   ⤴ router→slot_check→load_contract→[conditional]→explore_edit|plan_builder；interrupt_before 加 explore_edit；末端接 trace
│   └── pr_creator.py              ✨ 真 branch+commit+gh pr create，dry_run 支持
├── observability/trace.py         ✨ JsonlTracer
└── scripts/setup_conduit_real.sh  ✨ clone Conduit fork + npm install + 设 fork remote
tests/
├── unit/                          ✨ test_{contract,acceptance,prompts,policy,tool_call,explore_edit_agent,pr_creator,trace}.py
└── integration/
    └── test_contract_e2e_view_count_real.py  ✨ 真 LLM e2e (env 不全自动 skip)
```

✨ = 新建 / ⤴ = 修改既有 / 共 ~2500 行新代码 + 103 新测试

---

## 3. Commit 链路（6 个 commit）

```
10c242a  §E   trace JSONL + 真 Conduit setup + e2e stub               338 passed + 2 skipped
13a0d97  §D   PrCreator 真 branch+commit+gh pr create                  331 passed
c127465  §C   Orchestrator 接入 (state + nodes + graph 分叉)           323 passed
70a02e0  §B4  ExploreEditAgent 主循环                                   314 passed
cfcbf2a  §B1-3 prompts + policy + tool_calls 协议                     306 passed
083b3a1  §A   Skill 抽象 + Acceptance + add_view_count contract        235 passed
```

每个 commit 完整 TDD 闭环（红 → 绿 → 整库回归），中间任意 commit 都可 `git checkout` 跑测试。

---

## 4. 双路径运行时形态

```
PM 输入
  └─ clarify_reflexion (已有, §36 加分锚点)
      └─ router (已有)
          └─ slot_check (已有)
              └─ load_contract ← v3 新增
                  ├─ contract != None →[INTERRUPT]→ explore_edit ← v3 新增
                  │      └─ ExploreEditAgent.run() 循环:
                  │          - llm.chat(tools=get_tools()) 接 OpenAI tool-calling
                  │          - dispatch_tool 调度平台 14 工具 (await asyncio.to_thread)
                  │          - 走 policy 装饰: denylist + bash 白名单 + shell metachar 拒绝
                  │          - tool 失败 → TOOL_ERROR_RECOVERY 回灌
                  │          - 无 tool_calls → 跑 AcceptanceCheck.run() → 失败回灌 retry
                  └─ contract == None →[INTERRUPT]→ plan_builder (旧路径) → step_executor (旧路径)
                  ↓
              verify (已有，TODO: 跑 npm test via bashTool)
                  └─[INTERRUPT]→ pr_creator (v3 重写)
                      └─ env CODEWIZ_HEAD_REPO 未设 → mock URL
                      └─ 设了 → PrCreator: git checkout -b + add -A + commit + format-patch
                                + (CODEWIZ_PR_DRY_RUN!=false 时) git push + gh pr create --draft
                          └─ trace (v3 新增): 4 类事件落 logs/trace.jsonl
                              └─ END
```

---

## 5. 给队友的 Review Request（请重点看下面三段，决定接入策略）

### 5.1 @赵雷 — 沙箱 + PR 工作流

**Q1: 沙箱路径接入方式** （**这个不定无法跑明天 spike**）

我们的 ExploreEditAgent 用 `state["repo_clone_path"]` 作为：
- 真文件 acceptance 检查的 fs root
- PrCreator git commit 的 cwd

但 LLM 工具（writeFileTool 等）实际写入的目录是 `harness.tools._project_dir()` = `${SANDBOX_ROOT}/<repo_id>/`，由 `set_current_context(repo_id)` 控制。

**这两个路径必须一致**，但目前我们的 `setup_conduit_real.sh` 默认 clone 到 `ai-service/external/conduit_real/`，**和平台沙箱路径不汇聚**。

候选方案，请你拍板：
- **(A)** setup 脚本默认 clone 到 `${CODEWIZ_SANDBOX_ROOT:-/tmp/codewiz-sandbox}/conduit_real/`，`node_explore_edit` 起始处调 `set_current_context(repo_id="conduit_real")`，让三处汇聚到沙箱内
- **(B)** 我们继续 clone 到 `ai-service/external/`，但需要调你的 `SandboxManager.create_sandbox(repo_id=..., source_dir=...)` 接口让你接管，由你决定 LLM 工具实际写哪
- **(C)** 你已有别的方案

我们倾向 (A) 最快，但 (B) 更符合生产形态（docker / k8s 沙箱）。

**Q2: PrCreator vs mcp-server-github**

我们用 `gh CLI` shell out 实现了 `git push + gh pr create --draft`，跑通可演示。但你之前规划的 mcp-server-github 接入也会做同件事。

请确认：
- **短期 demo**：用我们的 gh CLI 路径？还是等你的 mcp-pr？
- **长期生产**：你接入 mcp-pr 后我们 PrCreator 删除？还是 PrCreator 改成 mcp-pr 客户端？

**Q3: bashTool 白名单的执行环境**

我们的 `agents/policy.py` 把 bashTool 限制在白名单：
```python
("npm", "test"),
("npm", "test", "-w", "backend"),
("npm", "test", "-w", "frontend"),
("npm", "run", "build", "-w", "frontend"),
("git", "diff"),
("git", "status"),
("git", "log"),
("git", "rev-parse"),
("git", "branch"),
("git", "show"),
```

这些命令在你的沙箱里能跑吗（docker exec / 本地 / 远程 VM）？有什么命令格式约定需要调整？

### 5.2 @苏家煜 — 前端消费接口

**Q4: trace.jsonl 事件 schema**

我们落 4 类事件（一行一 JSON）：

```json
{"id":"a1b2","ts":1716832000.1,"kind":"contract_loaded","trace_id":"x","skill":"add_view_count","goal":"加 viewCount","n_acceptance":3}
{"id":"c3d4","ts":1716832001.2,"kind":"diff_summary","trace_id":"x","files":["ArticleMeta.jsx"],"n_files":1}
{"id":"e5f6","ts":1716832002.0,"kind":"acceptance","trace_id":"x","check":"FileContains(...)","ok":true,"detail":""}
{"id":"g7h8","ts":1716832003.5,"kind":"pr_created","trace_id":"x","url":"https://github.com/...","branch":"...","dry_run":false}
```

前端时间线展示，你这套 schema 直接消费够吗？还需要哪些字段（latency_ms / tokens / cost_cny / reasoning_content）？我可以在 §A-§E 之外加一个补丁加埋点。

**Q5: 双 interrupt gate UI**

`OrchestratorState.awaiting_gate` 字段已存在（`"clarify" | "plan" | "pr"`），interrupt_before 列表现在是 `["plan_builder", "explore_edit", "step_executor", "pr_creator"]`。

你想要的 contract 确认卡片需要哪些字段（goal / constraints / forbid / acceptance 列表）？要不要我把这些 dict 用专门的 helper 在 state 里 flatten 成前端友好格式？

**Q6: reasoning_content 流式**

`LLMResponse.reasoning_content` 已落到 trace.jsonl，前端读 JSONL 还是要 SSE 直推？SSE 端点需要我加吗？

### 5.3 @全员 — OrchestratorState 契约

`state.py` 加了 4 个字段，**全部向后兼容**：

| 新字段 | 默认值 | 用途 |
|---|---|---|
| `skill_contract` | None | SkillContract.model_dump() 或 None (分叉信号) |
| `acceptance_results` | [] | AcceptanceResult dict 列表 |
| `pending_diff` | [] | ExploreEditAgent 改过的 file 路径 |
| `trace_id` | None | JSONL trace 关联 id |

全部 JSON-serializable，兼容 PostgresSaver。你们已有代码用 `state[xxx]` 读不到这些字段不会挂（KeyError 不会发生，default empty）。

---

## 6. 已知 bug 等你们答复后修

| Bug | 严重度 | 等谁 | 修复时间估计 |
|---|---|---|---|
| 沙箱路径错配（Q1） | 🔴 必修才能跑 spike | @赵雷 拍板 (A)/(B) | 30 min |
| PrCreator vs mcp-pr 重复 | 🟡 短期不影响 | @赵雷 拍板 | 0 - 1h |
| trace schema 不足 | 🟢 加埋点容易 | @苏家煜 反馈缺什么 | 30 min - 1h |

## 7. 已自修

- **#2 async/sync 阻塞**（AI service 内部）: `tool_result = await asyncio.to_thread(self.dispatch, ...)`。bashTool 真跑 `npm test`（30s）不会冻 event loop。

---

## 8. 跑一下试试

```bash
cd ai-service

# 整库回归 (338 passed + 2 skipped)
.venv/bin/pytest tests/ -q

# 看新路径的关键测试
.venv/bin/pytest tests/unit/test_contract.py \
                 tests/unit/test_acceptance.py \
                 tests/unit/test_explore_edit_agent.py \
                 tests/unit/test_policy.py \
                 tests/unit/test_orchestrator_nodes.py -v

# 真 LLM e2e (要 env, 也要 setup Conduit fork)
# 暂时跳过, 等沙箱接入策略 (Q1) 拍板后跑
```

测试覆盖关键场景：denylist 写 .env 被拦 / bashTool 拒 shell metachar / acceptance fail 自动重试 / tool error 回灌 / max_iters 兜底 / dry_run PR / trace 4 类事件 / contract 路径分叉 / 旧 Skill 走旧路径不变 / FakeLLM 模拟 tool_calling 全链路。

---

## 9. 备份 demo（如果新架构在答辩前没全跑通）

`feat/agents-skills` 分支 `b7895ef` 的旧路径仍然在：8/8 公开题路由 + 7/8 出 diff + 2 个 100% Skill (L1.4/L2.4)。

`feat/contract-agent` 分支没破坏 PR #6 的任何行为，旧路径在双路径共存模式下继续可用。两边都可演示。

---

## 10. 答辩对位（端到端.md 评分项）

| 锚点 | 状态 |
|---|---|
| §92 扣分项 "prompt 硬编码" | ✅ Contract 替代固定 step 列表 |
| §94 扣分项 "无测试兜底" | ✅ AcceptanceCheck 强检查 + bashTool 跑 npm test |
| §96 扣分项 "mock/伪实现" | ✅ PrCreator 真 git + gh CLI (设了 env 后) |
| §103 加分 "新增 1 Skill 文件" | ✅ SkillRegistry.discover 地基已有, contract 模式让"1 文件"更声明 |
| §105 加分 "断点重放" | ✅ interrupt_before 4 节点 + PostgresSaver |
| §107 加分 "跨栈一致性" | ✅ L1-B contract 4 路径 (model/migration/controller/frontend) |
| §109 加分 "可观测性" | ✅ trace.jsonl 主链路 4 类事件 |
| §154 "AI 使用记录" | ✅ trace.jsonl 即 AI 使用日志 |

---

## 联系方式 / 后续

- 这份文档 + 分支挂在 PR 里一起出。
- 上面 Q1-Q6 任意一个的答复，请直接 reply PR comment / Slack 都行。
- 明天 9:30 计划 30 min 三人同步（Q1/Q4/Q5 是阻塞 Day 1 spike 的最高优先级）。
