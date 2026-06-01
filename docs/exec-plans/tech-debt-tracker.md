# Tech Debt Tracker / 技术债务追踪

已知技术债务清单。每项标注优先级、影响范围和初步解决思路。

**AI 须知：发现新的技术债务时添加到此文件；解决后标注完成日期。**

## 活跃项

| # | 描述 | 优先级 | 影响范围 | 发现日期 |
|---|------|--------|----------|----------|
| 1 | ESLint 存量 4 个 error（`MessageItem.tsx` hooks 条件调用、`ChatView` impure render、`GalleryDetail` setState in effect） | 中 | CI lint 步骤需 `continue-on-error` | 2026-03-04 |
| 2 | `conversation-registry` / `permission-registry` 运行态依赖内存 Map，重启后丢失 | 中 | 长时间运行的会话、Bridge 模式 | 2026-02-26 |
| 3 | 消息 fallback 上下文固定最近 50 条，无动态 token 预算截断 | 低 | 长会话上下文质量 | 2026-02-26 |
| 4 | `context-storage-migration` Phase 0 剩余：`projects` 表未建、`canUpdateSdkCwd` 未实现 | 低 | 多项目隔离 | 2026-03-04 |
| 5 | Bridge 的 `/mode plan` 在会话权限档位为 `full_access` 时仍会被 `bypassPermissions` 覆盖，导致 Plan 语义失效；需让 bridge 与桌面聊天一致，显式以 Plan 优先于 full_access | 中 | Bridge 远程会话的权限/安全语义 | 2026-03-25 |
| 6 | Electron 主进程行为（外链拦截、窗口管理等）无自动化测试覆盖。现有 Playwright 测试只覆盖 Next.js web 层，需要搭建 `@playwright/test` + `_electron.launch()` 的 Electron E2E 测试框架 | 低 | Electron 主进程回归风险 | 2026-03-30 |
| 7 | `claude-settings-credentials.test.ts` 的 "DB provider WITHOUT api_key" 和 `project-mcp-injection.test.ts` 的 "resolves ${...} env placeholders" 两条 regression test 在 CI（ubuntu/node 20）上用 `process.env.CI ? it.skip : it` 跳过了。根因疑似 tsx 对 `@/lib/db` 与 `../../lib/db` 动态 import 的 module identity 去重在 linux 上行为与 macOS 不一致：`createProvider` / `setSetting`（测试侧）写的 db 和 prod 代码里 `getProvider` / `getSetting`（registry / mcp-loader）读的 db 不是同一个句柄。本地两套都通过。需要深入排查 tsx + node 20 的 ESM 模块解析差异，或者改用依赖注入让测试不依赖真实 DB | 中 | 丢失一条 provider-ownership 边界断言 + 一条 env placeholder 解析断言的 CI 覆盖；其他测试仍覆盖相近路径 | 2026-04-15 |
| 8 | `@file`/`@directory` mention 无法识别带空格的路径（如 `docs/Product Spec.md`、`My Folder`）。插入文本是裸 `@${path}`，但 `parseMentionRefs` 用 `/@([^\s@]+)/` 分词，遇到空格就截断；`mentionNodeTypes[path]` 查不到，chip 消失、结构化 mention 不发送、目录 summary / 文件附件路径全部跳过。影响 PR #508 picker 插入 和 07eb5a9 目录拖拽两条链路。修复需要同时改 插入 token（转义或引号）+ `parseMentionRefs` 解析 + Backspace 整块删除逻辑；建议单开小 PR 处理并补测试 | 中 | 任何含空格的路径都无法走结构化 mention 流程；仅纯文本可达 LLM | 2026-04-18 |
| 9 | `src/__tests__/e2e/layout.spec.ts` 的 Sidebar Collapse/Expand、Theme Switch、Navigation Menu Highlight、Header、Mobile Responsive、Three-Column Layout (V2) 六个 describe 块都在测已经被重写的旧版布局（带 sr-only "Toggle sidebar" / "Toggle theme" 的按钮、header `<h1>` 标题、`navLink(Chat/Plugins/MCP Servers/Settings)`、右侧面板等）。当前 UI 改用 UnifiedTopBar + NavRail + ChatListPanel，且 nav 项是 Skills/MCP/CLI 工具/素材库/远程桥接。已在 spec 里 `test.describe.skip` 占位，避免 E2E gate 长期红；需要按新 layout 重写断言 | 中 | E2E 布局覆盖缺失；新 UI 回归只能靠手动 / CDP 抽查 | 2026-04-19 |
| 10 | `/api/search` 的 file branch 目前是 N-recent-unique-workspaces 的递归 fs.readdir 扫描——全局搜索每次键入都会触发 sequential workspace 扫描。当前临时方案：按 resolved path 去重后 all-mode 限 5 个最近 workspace，`file:` 限 15 个；超出范围无法通过不加前缀的搜索找到。真正的解是**文件索引**：在 session 创建 / 文件变更时维护持久化 trie 或 SQLite FTS 表，搜索时从索引读而不是每次扫磁盘。索引命中率高后可以放宽上限回到"全量扫描" | 中 | 搜索结果范围受限：跨 10+ 项目找文件必须用 `file:` 前缀；不加前缀默认只在最近 5 workspace 里找 | 2026-04-19 |

## 已解决

| # | 描述 | 解决日期 | 解决方式 |
|---|------|----------|----------|
| — | （暂无） | | |
