# CodeWiz

**掌控一切的 AI Agent 桌面客户端** -- 连接任意 AI 服务商，通过 MCP 和 Skills 扩展能力，自动化任务，让你的助理学会你的工作方式。

[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()]()
[![License](https://img.shields.io/badge/license-BSL--1.1-orange)]()

---

## CodeWiz 是什么？

CodeWiz 是一款跨平台桌面应用，将所有主流 AI 服务商汇聚于一处。无论你使用的是 Claude、GPT、Gemini、DeepSeek，还是通过 Ollama 运行本地模型，CodeWiz 都能为你提供统一而强大的界面 -- 不会丢失对话历史、上下文或设置。

但 CodeWiz 远不止聊天。它是一个功能完整的 AI Agent 平台：

- **多服务商支持**：对话中随时切换模型，不丢失上下文
- **远程 Bridge**：通过 Telegram、飞书、Discord、QQ 或微信控制 CodeWiz
- **MCP + Skills**：通过 MCP 服务器和可复用技能扩展能力
- **任务调度**：使用 cron 表达式自动化周期性 AI 任务
- **生成式 UI**：AI 创建交互式仪表盘和可视化组件，在应用内实时渲染
- **持久记忆**：你的助理会学习你的偏好并记住上下文

---

## 下载

| 平台 | 安装包 | 架构 |
|---|---|---|
| macOS | [.dmg](https://github.com/op7418/CodePilot/releases/latest) | arm64 / x64 |
| Windows | [.exe](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |
| Linux | [AppImage](https://github.com/op7418/CodePilot/releases/latest) · [.deb](https://github.com/op7418/CodePilot/releases/latest) · [.rpm](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |

---

## 功能一览

### AI 服务商（20+）

| 类别 | 服务商 |
|---|---|
| 直连 API | Anthropic、Anthropic 第三方 |
| 云平台 | AWS Bedrock、Google Vertex AI |
| 国内 AI | 智谱 GLM、Kimi、Moonshot、MiniMax、DeepSeek、火山引擎方舟、小米 MiMo、阿里云百炼 |
| 开源路由 | OpenRouter |
| 本地 / 自托管 | Ollama、LiteLLM |
| 媒体 | Google Gemini（图片生成） |

### 对话与交互

- **三种模式**：Code（代码）、Plan（规划）、Ask（问答）
- **推理控制**：Low / Medium / High / Max + 扩展思考
- **会话控制**：暂停、恢复、回退到任意检查点、归档
- **分屏**：并排运行两个会话
- **附件**：文件和图片，支持多模态视觉
- **斜杠命令**：`/help`、`/clear`、`/cost`、`/compact`、`/doctor`、`/review` 等
- **集成终端**：应用内完整的终端模拟器
- **Git 面板**：状态、分支、提交、worktree 管理

### 扩展与集成

- **MCP 服务器**：stdio / SSE / HTTP 传输，运行时状态监控
- **Skills**：自定义、项目级和全局技能，支持 skills.sh 市场
- **CLI 工具**：Claude Code、Codex、O1、Gemini CLI、Cursor、Windsurf、Trae、Goose、Aider、Cline、Continue、Devin、Zed AI、Cody、Supermaven、Tabnine、v0 等
- **远程 Bridge**：Telegram / 飞书 / Discord / QQ / 微信 远程控制
- **图片生成**：Gemini 生图，支持批量任务和画廊
- **Claude Code CLI 导入**：导入你的 `.jsonl` 会话历史

### 数据与工作区

- **Assistant Workspace**：人设文件（`soul.md`、`user.md`、`claude.md`、`memory.md`）、Onboarding 引导、每日签到、持久记忆
- **生成式 UI**：AI 创建交互式仪表盘和可视化组件，在应用内实时渲染
- **文件浏览**：项目文件树，语法高亮预览
- **记忆系统**：语义索引，支持长期记忆提取、搜索和检索
- **用量分析**：Token 计数、费用估算、日用量图表
- **任务调度**：基于 cron 和定时间隔的持久化调度
- **Python 运行时**：在会话中执行 Python 代码，保持解释器状态
- **本地存储**：所有数据通过 SQLite（WAL 模式）存储在本地 -- 数据绝不离开你的设备
- **国际化**：中文和英文界面
- **主题**：深色和浅色模式，一键切换

---

## 快速开始

### 下载安装包

1. 从[下载](#下载)区域下载对应平台的安装包
2. 启动 CodeWiz
3. 前往 **设置 > 服务商** 添加你的 API Key
4. 开始对话

### 源码构建

```bash
git clone https://github.com/imagist13/CodeWiz
cd CodeWiz
npm install
npm run dev              # 浏览器模式，访问 http://localhost:3000
# -- 或者 --
npm run electron:dev     # 完整桌面应用
```

**环境要求**：Node.js 18+ 和 npm 9+

> **提示**：安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview)（`npm install -g @anthropic-ai/claude-code`）可解锁更多高级能力，如文件编辑、终端命令和 Git 操作。推荐安装但并非基础聊天所必需。

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                 Electron 40 (桌面外壳)                   │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │  主进程      │  │  Preload    │  │  终端管理器    │  │
│  │  - IPC      │  │  - dialog   │  │  - PTY/ConPTY  │  │
│  │  - 托盘     │  │  - bridge   │  │  - Shell 派生  │  │
│  │  - 自动更新 │  │  - notif    │  └────────────────┘  │
│  └──────────────┘  └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────┐
│               Next.js 16 (App Router)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ React 19 UI  │  │  30+ API    │  │ Claude Agent  │  │
│  │ 组件        │◄─┤  路由        ├─►│ SDK (SSE)     │  │
│  └──────────────┘  └──────────────┘  └───────┬───────┘  │
│                                              │           │
│  ┌──────────────────────────────────────────┼─────────┐  │
│  │              核心库 (src/lib/)             │         │  │
│  │  db.ts · claude-client.ts · provider-   │         │  │
│  │  catalog.ts · bridge/ · mcp-loader.ts  │         │  │
│  │  task-scheduler.ts · memory/           │         │  │
│  └──────────────────────────────────────────┼─────────┘  │
└─────────────────────────────────────────────┼────────────┘
                                              │
                                              ▼
                              ┌────────────────────────────┐
                              │   20+ AI 服务商           │
                              │  Anthropic · OpenRouter   │
                              │  GLM · Kimi · DeepSeek   │
                              │  Ollama · Bedrock 等      │
                              └────────────────────────────┘
```

**技术栈**：Electron 40 · Next.js 16 · React 19 · Tailwind CSS 4 · Radix UI · Motion · better-sqlite3 · Claude Agent SDK · Shiki · CodeMirror 6

---

## 平台说明

macOS 构建已签名但未公证。Windows 和 Linux 构建未签名。

**macOS Gatekeeper**：在访达中右键应用 > 打开 > 确认，或在终端运行 `xattr -cr /Applications/CodeWiz.app`。

**Windows SmartScreen**：在 SmartScreen 对话框中点击"更多信息"，然后点击"仍要运行"。

---

## 文档

完整文档请访问 [codepilot.sh/zh/docs](https://www.codepilot.sh/zh/docs)。

---

## 许可证

[Business Source License 1.1 (BSL-1.1)](LICENSE)

- 个人 / 学术 / 非营利用途：免费且无限制
- 商业用途：需要单独授权
- 变更日期：2029-03-16 -- 届时代码将转为 Apache 2.0
