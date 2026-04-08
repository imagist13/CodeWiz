# CodeWiz - AI 全栈应用构建平台

<p align="center">
  <img src="https://img.shields.io/badge/stars-%E2%98%85%E2%98%85%E2%98%85%E2%98%85%E2%98%85-success?style=flat-square" alt="stars">
  <img src="https://img.shields.io/badge/forks-%E2%98%86%E2%98%86%E2%98%86%E2%98%86%E2%98%86-blue?style=flat-square" alt="forks">
  <img src="https://img.shields.io/badge/issues-0-open-green?style=flat-square" alt="issues">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license">
</p>

> 🤖 通过自然语言快速构建完整应用的一站式 AI 开发平台

[快速开始](#-快速启动) · [功能演示](#-核心功能) · [贡献指南](#-贡献指南) · [更新日志](#-更新日志)

---

## 🌟 项目亮点

| | | |
|:---|:---|:---|
| 💬 **自然语言开发** | 用日常语言描述需求，AI 自动生成完整可运行项目 | |
| ⚡ **实时预览** | 代码改动即时生效，所见即所得的预览体验 | |
| 🛠️ **14 种开发工具** | AI 自主执行文件读写、终端命令、Git 提交等操作 | |
| 🔐 **安全沙箱** | 每个项目独立隔离环境，确定性端口映射 | |
| 🐳 **一键部署** | Docker Compose 编排，开箱即用的微服务架构 | |

---

## 📖 项目背景

在日常开发中，重复性代码（CRUD、API 对接、配置管理）占据了大量时间。本项目旨在构建一个**端到端**的 AI 应用开发平台，用户通过自然语言描述需求，系统自动生成完整项目代码并提供实时预览。
此项目前端根据https://github.com/freestyle-sh/Adorable的前端界面，后端使用go+python重构。同时通过学习https://github.com/shareAI-lab/learn-claude-code来构建coding-agent harness。感谢大佬们开源。本项目作者遵守开源协议，仅用于学习与交流。

**技术栈**：Next.js 16 + Go + FastAPI + PostgreSQL + Docker  

[![Next.js](https://img.shields.io/badge/next.js-16-black.svg?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![Go](https://img.shields.io/badge/go-1.21-00ADD8.svg?style=flat-square&logo=go)](https://go.dev/)
[![Python](https://img.shields.io/badge/python-3.11-blue.svg?style=flat-square&logo=python)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql)](https://postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker)](https://docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Nginx (反向代理/SSL)                           │
│                         端口: 80 / 443                                │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    Frontend     │   │    Backend      │   │   AI Service    │
│   Next.js 16    │   │   Go + Gin      │   │    FastAPI      │
│    端口 3000    │   │    端口 8080    │   │    端口 8000    │
│                 │   │                 │   │                 │
│ • App Router   │   │ • JWT 认证      │   │ • LLM 流式调用  │
│ • AI SDK       │   │ • REST API     │   │ • Agent 循环    │
│ • 实时预览      │   │ • GORM ORM     │   │ • 工具系统      │
│ • Tailwind 4   │   │ • PostgreSQL   │   │ • 沙箱管理      │
└─────────────────┘   └────────┬────────┘   └────────┬────────┘
                              │                    │
                              └─────────┬──────────┘
                                        ▼
                              ┌─────────────────────┐
                              │      PostgreSQL     │
                              │        端口 5432     │
                              └─────────────────────┘
```

**技术选型理由**：

| 服务 | 技术 | 选型原因 |
|------|------|----------|
| 前端 | Next.js 16 | App Router + Server Actions，减少客户端 JS 体积 |
| 后端 | Go + Gin | 高性能 HTTP 框架，简洁的中间件设计 |
| AI 服务 | FastAPI | 原生异步支持，与 Python AI 生态无缝集成 |
| 数据库 | PostgreSQL | 关系型数据 + JSONB 扩展，支持工具调用记录 |
| LLM | 硅基流动 | 国产优质 API，支持多种模型 |
| 代理 | Nginx | 成熟的反向代理方案，SSL 终结 |

---

## 🔧 核心功能

### 1. 自然语言对话生成

用户输入需求描述，AI 自动分析并生成完整的项目代码：

```typescript
// 前端集成 Vercel AI SDK
const { messages, input, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  streamProtocol: 'text',
});

handleSubmit(e, { options });
```

### 2. 流式响应 (SSE)

LLM 响应通过 **Server-Sent Events** 实时推送，前端逐字展示：

```python
# FastAPI 流式响应
async def chat(request: ChatRequest):
    async def generate():
        async for event in agent.run(messages):
            if event.type == "content":
                yield f"data: {json.dumps({'type': 'text', 'content': event.content})}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 3. 工具调用系统 (Harness)

Agent 在对话过程中主动调用工具，实现真正的"执行"操作：

| 工具名称 | 功能描述 |
|---------|---------|
| `bashTool` | 执行 Shell 命令 |
| `writeFileTool` | 生成/修改代码文件 |
| `readFileTool` | 读取文件内容 |
| `replaceInFileTool` | 替换文件中的文本 |
| `listFilesTool` | 列出目录文件 |
| `searchFilesTool` | 在目录中搜索文本 |
| `makeDirectoryTool` | 创建目录 |
| `movePathTool` | 移动/重命名文件或目录 |
| `deletePathTool` | 删除文件或目录 |
| `startDevServerTool` | 启动项目开发服务器 |
| `getPreviewUrlTool` | 获取预览 URL |
| `checkAppTool` | 检查应用运行状态 |
| `devServerLogsTool` | 读取开发服务器日志 |
| `commitTool` | Git 提交更改 |

**Agent 执行循环**：

```python
class AgentLoop:
    async def run(self, messages: List[Dict]) -> AsyncIterator[StreamEvent]:
        llm = llm.bind_tools(tools)  # 绑定 14 个工具

        while iteration < max_iterations:
            response = await llm.ainvoke(messages)
            if response.tool_calls:  # LLM 决定调用工具
                for tool_call in response.tool_calls:
                    result = dispatch_tool(tool_call.name, tool_call.args)
                    messages.append(ToolMessage(content=str(result), tool_call_id=tool_call.id))
            else:  # 无工具调用，输出最终结果
                yield StreamEvent(type="finish", content=response.content)
                return
```

### 4. GitHub 集成

支持从 GitHub 仓库导入项目，无缝衔接到现有开发工作流：

- 通过 `owner/repo` 格式快速导入已有代码库
- 自动创建项目并初始化对话上下文
- 支持 Webhook 同步仓库变更

---

## ✨ 技术亮点

### 1. 三语言微服务架构

项目中同时使用 **Go、Python、TypeScript** 三种语言：

| 语言 | 职责 | 框架/工具 |
|------|------|----------|
| TypeScript | 前端应用，紧跟 React 生态 | Next.js 16 + Tailwind CSS 4 |
| Go | 高并发 API 请求，JWT 认证 | Gin + GORM |
| Python | AI/ML 相关逻辑，异步 LLM 调用 | FastAPI + LangChain |

### 2. 完整 JWT 认证体系

```
用户登录
    ↓
Go Backend 生成 JWT (HS256, 7天有效期)
    ↓
前端存储 Token，每次请求携带 Bearer Token
    ↓
AI 服务回调 Backend 验证 Token (避免 JWT 库差异)
```

### 3. 数据库设计

使用 **JSONB** 字段存储工具调用记录：

```go
type Message struct {
    ID              uuid.UUID `gorm:"type:uuid;primary_key"`
    Role            string    `gorm:"size:50"`        // user/assistant/tool
    Content         string    `gorm:"type:text"`
    ToolCalls       JSONB     `gorm:"type:jsonb"`     // 工具调用记录
    ToolCallID      string    `gorm:"size:255"`
}
```

### 4. 确定性沙箱端口映射

每个项目通过哈希算法映射到固定端口，重启后保持一致：

```python
def _project_id_hash_port(project_id: str) -> int:
    """确定性哈希：同一项目 → 同一端口"""
    h = 2166136261
    for ch in project_id.encode():
        h ^= ch
        h = (h * 16777619) & 0xFFFFFFFF
    return SANDBOX_PORT_START + (h % SANDBOX_PORT_COUNT)
```

### 5. 前后端深度优化

- **Next.js Standalone 模式**：Docker 镜像体积最小化
- **Zustand 轻量状态管理**：避免 Redux 过度设计
- **Tailwind CSS 4**：原子化 CSS，开发效率高
- **Vercel AI SDK**：开箱即用的流式对话支持

---

## 📦 核心模块

### 项目架构

```
CodeWiz/
├── frontend/                  # Next.js 16 前端 (端口 3000)
├── backend/                   # Go + Gin 后端 (端口 8080)
├── ai-service/                # FastAPI AI 服务 (端口 8000)
├── nginx/                     # Nginx 反向代理
├── docker-compose.yml         # 容器编排
├── .env.example               # 环境变量示例
└── README.md
```

### Go Backend

```
backend/
├── cmd/server/main.go           # 程序入口
├── internal/
│   ├── config/config.go         # 配置管理 (环境变量映射)
│   ├── router/router.go         # Gin 路由注册
│   ├── middleware/auth.go        # JWT 鉴权中间件
│   ├── handlers/                # HTTP 处理器
│   │   ├── auth_handler.go      # 登录/注册/登出
│   │   ├── project_handler.go   # 项目 CRUD
│   │   └── conversation_handler.go
│   ├── services/                # 业务逻辑层
│   └── repositories/            # 数据访问层 (GORM)
└── pkg/response/response.go     # 统一 API 响应格式
```

### Python AI Service

```
ai-service/
├── app/
│   ├── main.py                 # FastAPI 应用入口
│   ├── api/
│   │   ├── chat.py             # 流式对话 API (SSE)
│   │   ├── conversation.py      # 会话管理 API
│   │   ├── auth.py             # 用户认证 API
│   │   └── sandbox.py           # 沙箱管理 API
│   ├── harness/
│   │   ├── agent.py            # LangChain Agent 执行循环
│   │   ├── tools.py            # 14 个工具定义
│   │   └── sandbox_manager.py  # 项目沙箱管理器
│   └── llm/
│       └── silicon_flow.py     # 硅基流动 LLM 客户端
└── requirements.txt
```

### Next.js Frontend

```
frontend/
├── app/
│   ├── assistant.tsx           # AI 对话核心组件
│   ├── layout.tsx              # 根布局
│   ├── page.tsx                # 首页
│   ├── auth/login/             # 登录页
│   ├── auth/register/          # 注册页
│   └── [repoId]/               # 动态路由
│       ├── page.tsx            # 项目工作区
│       └── [conversationId]/   # 会话详情
├── components/
│   └── assistant-ui/            # 对话 UI 组件库
└── lib/
    ├── auth-context.tsx        # 认证上下文
    └── repos-context.tsx       # 项目上下文
```

---

## 🐳 容器化部署

Docker Compose 一键启动所有服务：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]

  backend:
    build: ./backend
    depends_on:
      postgres:
        condition: service_healthy

  ai-service:
    build: ./ai-service
    volumes:
      - sandbox_data:/tmp/codewiz-sandbox

  frontend:
    build: ./frontend

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
```

---

## 📊 项目成果

| 成果 | 描述 |
|------|------|
| ✅ 用户认证体系 | 注册/登录/JWT 生成/JWT 验证完整闭环 |
| ✅ 流式对话 | SSE + Agent 工具调用循环，实时响应 |
| ✅ 14 个开发工具 | 覆盖文件操作、终端命令、Git 提交等 |
| ✅ 一键部署 | Docker Compose 编排，开箱即用 |
| ✅ 实时预览 | 代码生成后即时预览，所见即所得 |

---

## 🧩 技术难点与解决

| 难点 | 解决方案 |
|------|----------|
| LLM 输出不稳定 | 工具调用 schema 约束模型行为，提高可预测性 |
| 上下文长度限制 | 会话历史限制 + 摘要策略，控制 token 消耗 |
| 多服务 JWT 鉴权 | AI 服务回调 Backend 验证，避免 JWT 库差异 |
| 流式响应性能 | 分块传输 + 背压控制，优化响应延迟 |
| 项目端口冲突 | 确定性哈希映射，同一项目始终映射到相同端口 |
| 代码执行安全 | 沙箱隔离环境，防止恶意代码影响宿主机 |

---

## 🔮 未来优化方向

- [ ] 引入向量数据库，支持 RAG 知识增强
- [ ] 增加 WebSocket 支持，双向实时通信
- [ ] 多租户隔离，满足企业版需求
- [ ] 支持更多 LLM 提供商（OpenAI、Anthropic 等）
- [ ] 团队协作功能，多人实时编辑
- [ ] 项目模板市场，快速启动常见项目类型

---

## 🚀 快速启动

### 环境要求

| 工具 | 版本要求 |
|------|----------|
| Docker | 20.10+ |
| Docker Compose | 2.0+ |
| Git | 2.0+ |

### 启动步骤

```bash
# 1. 克隆项目
git clone <repo-url>
cd CodeWiz

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入必要配置（见下节）

# 3. 启动所有服务
docker-compose up -d --build

# 4. 验证服务状态
docker-compose ps

# 5. 访问应用
open http://localhost
```

### 手动启动（开发模式）

```bash
# 后端
cd backend && go run cmd/server/main.go

# AI 服务（另开终端）
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --reload

# 前端（另开终端）
cd frontend && npm install && npm run dev
```

---

## ⚙️ 配置说明

### 环境变量 (.env)

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `DATABASE_URL` | ✅ | - | PostgreSQL 连接地址 |
| `JWT_SECRET` | ✅ | - | JWT 签名密钥（生产环境请使用复杂随机字符串） |
| `SILICON_FLOW_API_KEY` | ✅ | - | 硅基流动 API Key |
| `BACKEND_URL` | | `http://localhost:8080` | Go 后端地址 |
| `AI_SERVICE_URL` | | `http://localhost:8000` | AI 服务地址 |
| `FRONTEND_URL` | | `http://localhost:3000` | 前端地址 |

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Nginx | 80 / 443 | 入口网关 |
| Frontend | 3000 | Next.js 开发服务器 |
| Backend | 8080 | Go API 服务 |
| AI Service | 8000 | FastAPI 服务 |
| PostgreSQL | 5432 | 数据库 |

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发工作流

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 代码规范

- Go 代码遵循 [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- Python 代码遵循 [PEP 8](https://pep8.org/)
- TypeScript 代码遵循 ESLint 配置
- 提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/)

### 测试

```bash
# Go 测试
cd backend && go test ./...

# Python 测试
cd ai-service && pytest

# 前端测试
cd frontend && npm run test
```

---

## 📝 更新日志


- ✅ 完成用户认证体系（注册/登录/JWT）
- ✅ 实现流式对话（SSE + Agent）
- ✅ 支持 14 个开发工具
- ✅ 完成 Docker Compose 部署
- ✅ 添加实时预览功能

---

## ❓ 常见问题

### Q: 如何获取硅基流动 API Key？

访问 [硅基流动官网](https://www.siliconflow.cn/)，注册账号后在控制台创建 API Key。

### Q: 支持哪些 LLM 模型？

默认使用硅基流动的 Qwen/Qwen2.5-7B-Instruct，可通过修改 `LLM_MODEL` 环境变量切换其他模型。

### Q: 如何扩展新的工具？

在 `ai-service/app/harness/tools.py` 中添加新的工具定义，遵循现有工具的结构即可。

### Q: 沙箱的安全性如何保障？

每个项目运行在独立的沙箱进程中，通过进程隔离限制对宿主机的影响。端口映射使用确定性哈希，避免冲突。

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

---

<p align="center">
  <strong>如果你觉得这个项目有帮助，请给一个 ⭐️</strong>
  <br><br>
  <a href="https://github.com/codewiz/codewiz/stargazers">
    <img src="https://img.shields.io/github/stars/codewiz/codewiz?style=social" alt="Stars">
  </a>
  <a href="https://github.com/codewiz/codewiz/fork">
    <img src="https://img.shields.io/github/forks/codewiz/codewiz?style=social" alt="Forks">
  </a>
</p>
