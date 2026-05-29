# 交接文档：agents + skills + orchestrator 模块

> 分支：`feat/agents-skills` · 31 commits · 177 tests passing · 96% 覆盖
> 范围：ai-service 的 5 大新增子系统，对接 PR 时给队友看的入门文档

---

## 1. 一句话：我们做了啥

把 CodeWiz 模板的"通用 AI 写代码 Agent Loop"重构成了 **PM→Conduit 全栈交付的后端核心**：

- **Skill 双层抽象**（业务 + 模式）— 新需求 10 行 1 文件命中，不改主干
- **CodeMap AST 索引** — tree-sitter 扫 Conduit 出符号表，LLM 不再瞎找文件
- **LangGraph 编排状态机** — 7 节点 + 3 个 `interrupt_before` 硬卡点 + Postgres checkpoint
- **StepExecutor 管线** — LLM 只输出 5 行 diff 由 unidiff 落地，幻觉空间被压扁
- **LLMCall 装饰器** — 每次 LLM 调用记 tokens/latency/cost，喂 /metrics 仪表盘

---

## 2. 新增文件结构

```
ai-service/app/
├── skills/                       ✨ Skill 双层
│   ├── dsl.py                    FieldDef/DisplayDef/ButtonDef/Step
│   ├── base.py                   Skill/BusinessSkill/PatternSkill ABCs
│   ├── registry.py               单文件自动发现
│   ├── business/                 6 个业务 Skill (PM 入口)
│   │   ├── add_view_count.py
│   │   ├── add_comment_like.py
│   │   ├── add_cover_image.py
│   │   ├── add_article_draft.py
│   │   ├── add_word_count.py
│   │   └── add_edited_time.py
│   └── patterns/                 7 个模式 Pattern (工程实现)
│       ├── add_field.py
│       ├── add_field_with_idempotency.py
│       ├── add_enum_status.py
│       ├── inject_display.py
│       ├── inject_button.py
│       ├── inject_form_input.py
│       └── inject_computed_display.py
│
├── agents/                       ✨ 智能节点
│   ├── llm_protocol.py           LLMClient Protocol + FakeLLM
│   ├── skill_router.py           Skill 路由 top1+top3
│   ├── slot_check.py             必填槽位检查
│   ├── clarify_reflexion.py      Reflexion 两步澄清
│   └── verify_fixer.py           Lint/Test 失败修复
│
├── codemap/                      ✨ 上下文召回
│   └── scanner.py                tree-sitter 扫 Conduit
│
├── orchestrator/                 ✨ LangGraph 编排
│   ├── state.py                  OrchestratorState TypedDict
│   ├── checkpointer.py           Memory/Postgres saver 工厂
│   ├── nodes.py                  5 节点函数
│   └── graph.py                  StateGraph + 3 卡点
│
├── harness/                      ⚙️ 执行底层 (原模块保留, 新增以下)
│   ├── codemap_resolver.py       Step → file:line 映射
│   ├── prompt_builder.py         9 套 prompt 模板
│   ├── diff_apply.py             unidiff 包装
│   └── step_executor.py          单 Step 执行管线
│
└── observability/                ✨ 可观测
    ├── models.py                 LLMCall SQLAlchemy 表
    └── llm_recorder.py           async 装饰器
```

**原模板 0 改动**：`app/api/*` / `app/harness/agent.py` / `app/harness/tools.py` / `app/harness/sandbox/*` / `app/llm/llm.py` / `app/models/*` / `app/core/*` 一行没动。

**唯一改的旧文件**：`ai-service/requirements.txt` 加了 langgraph 0.2.x / unidiff / pytest-asyncio / tree-sitter；同步把 langchain-core/openai/community 下限提了一下解决 pre-existing pip 冲突。

---

## 3. 队友拿这些可以直接用什么

### 3.1 集成层 (`api/chat.py` 或新端点) 接 graph

```python
from app.orchestrator.graph import build_graph
from app.orchestrator.state import new_state
from app.orchestrator.checkpointer import make_checkpointer, CheckpointerKind
from app.observability.llm_recorder import LLMRecorder

# 启动时一次:
llm = ArkClient(api_key=..., ep="ep-20260514110933-mzh58")  # 队友实现
cp = make_checkpointer(CheckpointerKind.POSTGRES, dsn=settings.database_url)
cp.setup()  # 首次启动建 LangGraph 三表

wrapped_llm = LLMRecorder(
    session_factory=SessionLocal, session_id=sid, model="ep-...",
).wrap(llm)

graph = build_graph(
    sandbox_root="/tmp/codewiz-sandbox/<sid>/conduit",
    llm=wrapped_llm,
    checkpointer=cp,
)

# /api/chat 端点 (PM 第一次发消息)
state = new_state(
    session_id=sid, repo_clone_path=...,
    branch_name=f"feat/{intent_slug}",
    raw_intent=user_message,
)
config = {"configurable": {"thread_id": sid}}
async for ev in graph.astream(state, config=config):
    yield sse_format(ev)
# astream 在 interrupt_before 节点自然停 → 前端弹卡点 UI

# /api/sessions/<sid>/resume 端点 (PM 回答卡点问题后)
graph.update_state(config, {
    "pm_answers": pm_answers,
    "awaiting_gate": None,
})
async for ev in graph.astream(None, config=config):
    yield sse_format(ev)
```

### 3.2 ArkClient 实现需要遵守的 Protocol

```python
# 在 app/agents/llm_protocol.py 里:
class LLMClient(Protocol):
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        max_tokens: int = 2048,
        **metadata: Any,   # 必须吸收, 不用关心内容
    ) -> LLMResponse: ...

class LLMResponse(BaseModel):
    content: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    cost_cny: float
```

**关键**：`**metadata` 必须有，step_executor 调时会传 `skill_name=, prompt_key=, step_id=` 等元数据。ArkClient 内部丢掉这些 kwargs 就行，**LLMRecorder 包装层会单独存到 llm_calls 表**，ArkClient 不用关心。

### 3.3 LLMCall 表结构（队友 Go Backend 做 /api/metrics 端点查这个）

```sql
-- 字段定义在 app/observability/models.py
CREATE TABLE llm_calls (
  id            BIGSERIAL PRIMARY KEY,
  session_id    VARCHAR(64) NOT NULL,
  step_id       VARCHAR(64),
  skill_name    VARCHAR(64),
  prompt_key    VARCHAR(64),
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  latency_ms    INTEGER NOT NULL DEFAULT 0,
  cost_cny      NUMERIC(10, 6) NOT NULL DEFAULT 0,
  model         VARCHAR(64) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'ok',  -- ok | error
  error_msg     TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_llm_calls_session ON llm_calls(session_id, created_at);
```

迁移脚本未生成（队友决定用 alembic 还是 Go migration）。

### 3.4 SSE 事件 schema（前端拿来渲染）

详见 spec §3.6。最关键的几类：

```
text-delta              LLM 文本增量
reflexion-critique      反思理解输出 (展示在对话里)
questions-ready         追问问题清单
skill-matched           {skill, confidence}
plan-ready              {steps, target_files}
gate-awaiting           {gate_type: clarify|plan|pr}  → 前端弹卡点 UI
step-started            {step_id, layer, action, target_path}
step-llm-call           {tokens_in, tokens_out, latency_ms, cost_cny}  → mini-badge
step-diff               {step_id, diff}
step-succeeded/failed
pr-created              {url, number}
```

---

## 4. 队友请勿改动这些（接口稳定区）

```
✅ app/skills/base.py             - Skill ABC 接口
✅ app/skills/dsl.py              - FieldDef/Step 字段
✅ app/skills/registry.py         - .business(name) / .pattern(name) / .all_business()
✅ app/codemap/scanner.py         - CodeMap.find/.list 接口
✅ app/agents/llm_protocol.py     - LLMClient Protocol + LLMResponse 字段
✅ app/orchestrator/state.py      - OrchestratorState 17 字段
✅ app/observability/models.py    - LLMCall 表 schema
```

改了会牵动整套系统，包括前端 SSE / Backend metrics / 单测。

**可以放心改的**（FIXME 标记位置）：

| 文件 | 何时改 | 怎么改 |
|---|---|---|
| `app/harness/prompt_builder.py` | 真豆包跑下来某模板老错 | 微调对应 `_TEMPLATES[key]`，不动 PromptBuilder.build 签名 |
| `app/agents/skill_router.py` | PM 输入没命中预期 Skill | 加 LLM 同义判断层，不动 .route() 签名 |
| `app/codemap/scanner.py` | 真 Conduit 有 forwardRef/链式 router | 扩 _scan_* regex/查询，不动 SymbolRef/CodeMap |
| `app/harness/codemap_resolver.py` | 新 Pattern 加 action | 在 `_ACTION_TO_KIND` 加一行 |

---

## 5. 留给后续 Sprint 的 stub

| 文件 | 当前状态 | Sprint 2 做啥 |
|---|---|---|
| `app/orchestrator/graph.py::_verify` | MVP 直通返 `{}` | 接真 lint + jest，失败时调 `verify_fixer` |
| `app/orchestrator/nodes.py::node_pr_creator` | 返 mock URL | 接 mcp-server-github 真创建 PR |
| `app/context/conduit_loader.py` | 未实现 | 每会话 git clone Conduit submodule → sandbox 目录 |

---

## 6. 测试

```bash
cd ai-service
.venv/bin/pytest tests/unit tests/integration -q
# 预期: 177 passed
```

全程用 FakeLLM（在 `app/agents/llm_protocol.py`），不调真豆包，CI 不烧 token。

跑覆盖：

```bash
.venv/bin/pytest tests/unit tests/integration \
  --cov=app/skills --cov=app/codemap --cov=app/agents \
  --cov=app/orchestrator --cov=app/harness --cov=app/observability \
  --cov-report=term
# 预期: 我们新增模块 96%+ 覆盖
```

---

## 7. 公开题命中度（spec §9）

| 题号 | 题 | 状态 | Skill |
|---|---|---|---|
| L1.1 | 文章列表加阅读量 | ✅ | add_view_count（魔改全栈版） |
| L1.2 | Tags 前 5 个打标 | ❌ | 需要 add_list_badge Pattern |
| L1.3 | About Me Tab | ❌ | 需要 add_page_tab Pattern |
| L1.4 | 字数 + 阅读时间 | ✅ | add_word_count |
| L2.1 | 文章封面图 | ✅ | add_cover_image |
| L2.2 | 评论点赞含幂等 | ✅ | add_comment_like |
| L2.3 | 文章草稿 | ✅ | add_article_draft |
| L2.4 | 最后编辑时间 | ✅ | add_edited_time |

**6/8 命中**，剩 2 题各需补 1 个 Pattern + 1 个 Business Skill（约 1-2 小时/题）。

---

## 8. 设计文档索引

- `2026-05-23-codewiz-pma-design.md` — spec（架构 + 数据 + 错误处理 + 测试 + 排期）
- `2026-05-23-codewiz-pma-agents-skills-plan.md` — Plan A（21 Task，agents + skills + codemap）
- `2026-05-23-codewiz-pma-orchestrator-plan.md` — Plan B（12 Task，orchestrator + step_executor）
- `2026-05-24-codewiz-pma-progress.md` — 完整进度纪要 + 决策回顾

（设计文档在用户本地 `~/Desktop/sth/notes/字节/`，不在 repo 内。如果团队需要可以单独 push 一份到 repo 的 `doc/` 目录。）
