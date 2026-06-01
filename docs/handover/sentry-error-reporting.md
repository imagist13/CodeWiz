# Sentry 匿名错误上报

> 产品思考见 [docs/insights/user-audience-analysis.md](../insights/user-audience-analysis.md)

---

## 一、架构

三层覆盖，共用一个 DSN，共用一个 opt-out 机制。

```
Browser (Renderer)       Server (Node.js)         Electron Main
      │                       │                        │
  SentryInit.tsx         instrumentation.ts        electron/main.ts
  @sentry/browser        @sentry/node              @sentry/electron
      │                       │                        │
  beforeSend             beforeSend                Sentry.init()
  (localStorage check)   (strip auth headers)      (marker file check)
      │                       │                        │
      └─── DSN: next.config.ts env ──── DSN: hardcoded ┘
                     │
           ~/.codepilot/sentry-disabled
               (opt-out marker file)
```

### DSN

- Renderer + Server：通过 `next.config.ts` 的 `NEXT_PUBLIC_SENTRY_DSN` 环境变量
- Electron Main：硬编码（main process 不经过 Next.js env）
- DSN 是公开 ingest URL（Sentry 设计），安全提交到代码库

### 为什么不用 @sentry/nextjs

`@sentry/nextjs@9.x` 的 peer dep 要求 `next@^13 || ^14 || ^15`，CodePilot 用 Next.js 16。改用：
- `@sentry/browser` — 客户端
- `@sentry/node` — 服务端
- `@sentry/electron` — 主进程

---

## 二、初始化点

### Browser（即时）

**文件**：`src/components/layout/SentryInit.tsx`

- 客户端组件，在 `AppShell` 中渲染
- `useEffect` 中动态 `import('@sentry/browser')`，DSN 不存在时不加载
- `beforeSend` 检查 `localStorage['codepilot:sentry-disabled']`，opt-out 即时生效
- 去除 `ui.input` breadcrumb，删除 auth headers

### Server（启动时）

**文件**：`src/instrumentation.ts`

- Next.js `register()` hook，服务启动时执行一次
- 读取 `~/.codepilot/sentry-disabled` marker file
- 如果 marker 为 `true`，不初始化 `@sentry/node`
- opt-out 变更需**重启应用**才对 server 层生效

### Electron Main（启动时）

**文件**：`electron/main.ts`（文件最顶部，所有其他 import 之前）

- 读取 `~/.codepilot/sentry-disabled` marker file
- 如果 marker 为 `true`，不调用 `Sentry.init()`
- opt-out 变更需**重启应用**才对 main process 生效

---

## 三、Opt-out 机制

### 用户界面

**文件**：`src/components/settings/GeneralSection.tsx` — `SentryToggle` 组件

- 位置：Settings > General 卡片内，紧跟 Setup Center 下方
- 使用 `useSyncExternalStore` 读取 localStorage（无 hydration mismatch）
- 默认开启，用户可关闭

### 持久化

切换开关时同时写两个位置：
1. `localStorage['codepilot:sentry-disabled']` — browser 层即时读取
2. `~/.codepilot/sentry-disabled` 文件 — server + electron main 启动时读取

文件写入通过 `POST /api/settings/sentry`（`src/app/api/settings/sentry/route.ts`）。

### 生效时机

| 层 | opt-out 生效 |
|---|---|
| Browser | 即时（beforeSend 每次检查 localStorage） |
| Server | 重启后（instrumentation.ts 只在 register() 读一次） |
| Electron Main | 重启后（main.ts 顶部只读一次） |

文案已明确提示用户"更改后需重启应用才能完全生效"。

---

## 四、上报策略

### 什么会被上报

**文件**：`src/lib/error-classifier.ts` — `reportToSentry()`

仅上报严重错误类别：
- `PROCESS_CRASH` — Claude Code SDK 进程崩溃
- `UNKNOWN` — 无法分类的错误
- `CLI_NOT_FOUND` — CLI 找不到
- `CLI_INSTALL_CONFLICT` — CLI 安装冲突
- `MISSING_GIT_BASH` — Windows 缺 Git Bash
- `PROVIDER_NOT_APPLIED` — Provider 未生效
- `SESSION_STATE_ERROR` — 会话状态损坏

### 什么不会被上报

- `RATE_LIMITED` — 预期内，限流
- `CONTEXT_TOO_LONG` — 预期内，自动压缩处理
- `AUTH_REJECTED` / `AUTH_FORBIDDEN` — 用户配置问题
- `NETWORK_UNREACHABLE` — 网络问题
- `RESUME_FAILED` — 会话恢复失败（自动处理）

### React 渲染错误

**文件**：`src/components/layout/ErrorBoundary.tsx`

`componentDidCatch` 中通过 `import('@sentry/browser').then(Sentry.captureException)` 上报所有未捕获的 React 渲染错误。

### 隐私保护

- 不采集 performance trace（`tracesSampleRate: 0`）
- 不采集 session replay
- 不采集用户输入 breadcrumb（`ui.input` 过滤）
- 删除 auth headers（`x-api-key`、`authorization`、`anthropic-api-key`）
- 不含对话内容

---

## 五、关键文件清单

| 文件 | 职责 |
|------|------|
| `next.config.ts` | DSN 环境变量（NEXT_PUBLIC_SENTRY_DSN） |
| `electron/main.ts` | Electron main Sentry.init() + opt-out check |
| `src/instrumentation.ts` | Server Sentry.init() + opt-out check |
| `src/components/layout/SentryInit.tsx` | Browser 动态初始化 |
| `src/components/layout/ErrorBoundary.tsx` | React 错误捕获 → Sentry |
| `src/components/layout/AppShell.tsx` | 渲染 SentryInit |
| `src/lib/error-classifier.ts` | reportToSentry() 严重错误上报 |
| `src/components/settings/GeneralSection.tsx` | SentryToggle opt-out 开关 |
| `src/app/api/settings/sentry/route.ts` | opt-out marker 文件读写 API |
| `src/i18n/en.ts` + `zh.ts` | 开关文案 + 重启提示 |

---

## 六、免费额度管理

Sentry 免费版限额 5,000 错误/月。通过以下方式控制：

1. 只上报 `SENTRY_REPORTABLE` 集合中的严重错误（7 个类别）
2. `tracesSampleRate: 0` — 不采性能数据
3. `replaysSessionSampleRate: 0` — 不录回放
4. 预期内错误（限流、上下文过长）不上报

如果接近额度，可以在 Sentry Dashboard 设置 rate limiting。
