# CodeWiz Frontend

Next.js 16 前端，负责任务：

- 🎨 AI 对话界面（基于 assistant-ui）
- 📦 项目管理（创建 / 导入 / 删除）
- 🖥️ 实时预览（预览 iframe + 终端 iframe）
- 🔐 JWT 认证（登录 / 注册 / 登出）
- 🌐 项目工作区（Repo Workspace + 会话管理）

## 技术栈

| 技术 | 说明 |
|------|------|
| Next.js 16 | App Router + Server Actions + Turbopack |
| TypeScript | 类型安全 |
| Tailwind CSS 4 | 原子化样式 |
| Zustand | 轻量状态管理 |
| Vercel AI SDK | 流式对话支持 |
| assistant-ui | 对话 UI 组件库 |

## 目录结构

```
frontend/
├── app/
│   ├── layout.tsx              # 根布局（字体、主题、认证 Provider）
│   ├── page.tsx                # 首页（项目列表）
│   ├── auth/
│   │   ├── login/page.tsx     # 登录页
│   │   └── register/page.tsx  # 注册页
│   ├── [repoId]/
│   │   ├── page.tsx           # 项目工作区（侧边栏 + 对话 + 预览）
│   │   └── [conversationId]/  # 会话详情
│   └── api/
│       ├── chat/route.ts      # SSE 流式对话代理
│       └── sandbox-*/         # 预览 / 终端代理（路由到 AI 服务）
│
├── components/
│   └── assistant-ui/           # 对话 UI 组件（消息、工具调用、附件、思维链）
│
└── lib/
    ├── auth-context.tsx        # 认证状态（Zustand）
    ├── repos-context.tsx       # 项目列表状态
    └── repo-types.ts          # RepoItem / RepoVmInfo / RepoDeployment 类型
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 代码检查
npm run lint
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Go 后端地址 |
| `NEXT_PUBLIC_AI_SERVICE_URL` | `http://localhost:8000` | AI 服务地址 |

## 关键文件说明

| 文件 | 作用 |
|------|------|
| `app/assistant.tsx` | AI 对话核心组件（集成 Vercel AI SDK） |
| `app/api/chat/route.ts` | SSE 流式对话 API 路由 |
| `app/[repoId]/repo-workspace-shell.tsx` | 项目工作区外壳（预览 + 终端布局） |
| `components/preview/app-preview.tsx` | 实时预览组件（预览 iframe + 终端 tabs） |
| `lib/auth-context.tsx` | JWT Token 管理与认证状态 |
| `lib/repos-context.tsx` | 项目列表与当前项目状态管理 |
