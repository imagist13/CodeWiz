# Exec Plans / 执行计划

中大型功能的执行计划，包含分阶段目标、进度状态和决策日志。

**AI 须知：**
- 新建执行计划放在 `active/`，完成后移至 `completed/`
- 纯调研/可行性分析仍放 `docs/research/`
- 修改或新增文件后更新下方索引
- 检索本目录前先读此文件

## 什么时候需要执行计划

- 涉及数据库 schema 变更
- 跨 3 个以上模块的功能
- 需要分阶段交付的中大型功能
- 重构或迁移类任务

## 执行计划模板

```markdown
# {功能名称}

> 创建时间：YYYY-MM-DD
> 最后更新：YYYY-MM-DD

## 状态

| Phase | 内容 | 状态 | 备注 |
|-------|------|------|------|
| Phase 0 | ... | 📋 待开始 / 🔄 进行中 / ✅ 已完成 / ⏸ 暂缓 | |

## 决策日志

- YYYY-MM-DD: 决策内容及原因

## 详细设计

（目标、技术方案、拆分步骤、依赖项、验收标准）
```

## 索引

### Active

| 文件 | 主题 | 状态 |
|------|------|------|
| active/chat-latency-remediation.md | 聊天链路提速 + 模式入口收敛 + MCP 持久开关 | Phase 0 完成，Phase 1-4 待开始 |
| active/context-storage-migration.md | 上下文共享与存储迁移 | Phase 0 部分完成，Phase 1-3 待开始 |
| active/site-and-docs.md | 官网 + 文档站（apps/site） | Phase 0-1 进行中 |
| active/weixin-bridge-channel.md | 微信 Bridge 通道一次性交付方案 | One Shot 待开始 |
| active/unified-context-layer.md | 统一上下文层 + 浮窗助理 + 产品架构演进 | Phase 1-3 已完成，Phase 4-5 待开始 |
| active/provider-governance.md | 服务商系统治理：Preset Schema 校验、宿主接管、连通性验证、引导 UX、错误治理 | Phase 0 完成，Phase 1-6 待开始 |
| active/decouple-claude-code.md | 脱离 Claude Code 依赖 — 自建 Agent Runtime（Provider/Loop/Tools/MCP/Permission/Session/Skills/SubAgent） | Phase 0 完成，Phase 1-8 待开始 |
| active/runtime-auto-and-onboarding.md | Runtime auto 简化（CLI binary check 代替凭据推断）+ Chat 入口拦截 + 错误归一翻译（复用现有 SetupCenter）+ FileTree hotfix + 百炼 catalog 替换 | Phase 0-4 已完成（commits bc308e9/2d06f50/d1fac18/3e03919/a32837e），Phase 5 待发版 |
| active/issue-tracker.md | **统一问题跟踪** — 合并所有 Bug / Feature Request / Sentry 监控，持续更新（替代 open-issues + v0.48-post-release） | 持续维护 |
| active/opus-4-7-upgrade.md | Opus 4.7 模型升级：双 SDK 升级（agent-sdk + ai-sdk/anthropic）、`xhigh` effort + catalog 能力元数据回填、Native 路径 thinking/display/beta header 清理、tokenizer + vision 预算复核、prompt 字面化回归 | Phase 0 部分完成，Phase 1-6 待开始 |
| active/agent-sdk-0-2-111-adoption.md | Agent SDK 0.2.111 能力采纳（Codex 审核后双层化 + 用户视角推进路线图）：Layer A 已完成 Phase 1 chip + Phase 2b 类型适配 / 待做 Phase 1b chip 按钮 + Phase 2 限流 UI；Layer B 待 POC 后推进 WarmQuery / session fork / getContextUsage / 新 hooks / Elicitation / Deferred tools | SDK 升级已完成，下一步阶段 1（chip 按钮 + 限流 UI）1-2 周可发版 |
| active/v0.48-post-release-issues.md | v0.48.0/0.48.1 发版后问题追查（已归档至 issue-tracker.md，保留原始记录） | 已归档 |
### Completed

| 文件 | 主题 | 完成日期 |
|------|------|----------|
| completed/markdown-artifact-overhaul.md | Markdown 渲染/编辑 × Artifact 网页预览扩展（DiffSummary 卡片 + Sandpack TSX + 长图导出 + 文件树新建 .md + CodeMirror 编辑 + DataTable + 文件 I/O API） | 2026-04-21 |
| completed/hermes-inspired-runtime-upgrade.md | Hermes 借鉴的 Runtime 能力升级：6 核心模块 + 12 额外交付（并行安全、辅助模型、子目录 hint、session 搜索、Skill nudge UI、AskUserQuestion、压缩通知） | 2026-04-12 |
| completed/engineering-quality-assurance.md | 工程质量保障体系（Harness Engineering）— 验证闭环、AI 文档、CDP、执行计划 | 2026-03-04 |
