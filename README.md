# CodeWiz - AI 全栈应用构建平台

> 通过自然语言快速构建完整应用的一站式 AI 开发平台

**项目周期**：2024.03 - 2024.08  
**项目角色**：全栈独立开发  
**技术栈**：Next.js 16 + Go + FastAPI + PostgreSQL + Docker  

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/next.js-16-black.svg)](https://nextjs.org/)
[![Go](https://img.shields.io/badge/go-1.21-00ADD8.svg)](https://go.dev/)
[![Python](https://img.shields.io/badge/python-3.11-blue.svg)](https://python.org/)

---

## 项目背景

在日常开发中，重复性代码（CRUD、API 对接、配置管理）占据了大量时间。本项目旨在构建一个**端到端**的 AI 应用开发平台，用户通过自然语言描述需求，系统自动生成完整项目代码并提供实时预览。

**核心挑战**：如何让 AI 在多轮对话中保持上下文，理解业务意图，并生成可运行的完整项目？

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx (反向代理/SSL)                        │
│                         端口: 80 / 443                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    Frontend   │   │    Backend    │   │   AI Service  │
│   Next.js 16  │   │   Go + Gin    │   │  FastAPI      │
│    端口 3000  │   │    端口 8080  │   │   端口 8000   │
│               │   │               │   │               │
│ • App Router  │   │ • JWT 认证    │   │ • LLM 流式调用 │
│ • AI SDK      │   │ • REST API   │   │ • Agent 循环  │
│ • 实时预览    │   │ • GORM ORM   │   │ • 工具系统    │
└───────────────┘   └───────┬───────┘   └───────┬───────┘
                            │                   │
                            └─────────┬─────────┘
                                      ▼
                            ┌───────────────────┐
                            │    PostgreSQL     │
                            │      端口 5432    │
                            └───────────────────┘
```

**技术选型理由**：

| 服务 | 技术 | 选型原因 |
|------|------|----------|
| 前端 | Next.js 16 | App Router + Server Actions，减少客户端 JS 体积 |
| 后端 | Go + Gin | 高并发处理能力，简洁的中间件设计 |
| AI 服务 | FastAPI | 原生异步支持，与 Python AI 生态无缝集成 |
| 数据库 | PostgreSQL | 关系型数据 + JSONB 扩展，支持工具调用记录 |

---

## 核心功能

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

| 工具 | 功能 |
|------|------|
| `bashTool` | 执行 Shell 命令 |
| `writeFileTool` | 生成/修改代码文件 |
| `readFileTool` | 读取文件内容 |
| `startDevServerTool` | 启动开发服务器 |
| `getPreviewUrlTool` | 获取预览 URL |

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

---

## 技术亮点

### 1. 三语言微服务架构

项目中同时使用 **Go、Python、TypeScript** 三种语言：
- **Go**：处理高并发 API 请求，JWT 认证
- **Python**：AI/ML 相关逻辑，异步 LLM 调用
- **TypeScript**：前端应用，紧跟 React 生态

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

---

## 核心模块

### Go Backend

```
backend/
├── cmd/server/main.go           # 程序入口
├── internal/
│   ├── config/config.go         # 配置管理 (环境变量映射)
│   ├── router/router.go         # Gin 路由注册
│   ├── middleware/auth.go       # JWT 鉴权中间件
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
│   │   └── sandbox.py          # 沙箱管理 API
│   ├── llm/
│   │   └── silicon_flow.py     # LLM 客户端封装
│   └── harness/
│       ├── agent.py            # Agent 执行循环
│       ├── tools.py            # 14 个工具定义
│       └── sandbox_manager.py  # 项目沙箱管理
└── requirements.txt
```

### Next.js Frontend

```
frontend/
├── app/
│   ├── assistant.tsx           # AI 对话核心组件
│   ├── layout.tsx              # 根布局
│   └── [repoId]/               # 动态路由
│       └── repo-workspace-shell.tsx  # 工作区 (对话+预览)
├── components/assistant-ui/    # 对话 UI 组件
└── lib/auth-context.tsx        # 认证上下文
```

---

## 容器化部署

Docker Compose 一键启动：

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

## 项目成果

- 完成 **用户认证体系**（注册/登录/JWT/JWT 验证）
- 实现 **流式对话**（SSE + Agent 工具调用循环）
- 支持 **14 个工具** 覆盖完整开发流程
- **一键部署** 到云服务器，稳定运行
- 代码生成后 **实时预览** 所见即所得

---

## 技术难点与解决

| 难点 | 解决方案 |
|------|----------|
| LLM 输出不稳定 | 工具调用 schema 约束模型行为 |
| 上下文长度限制 | 会话历史限制 + 摘要策略 |
| 多服务 JWT 鉴权 | AI 服务回调 Backend 验证 |
| 流式响应性能 | 分块传输 + 背压控制 |
| 项目端口冲突 | 确定性哈希映射 |

---

## 未来优化方向

- [ ] 引入向量数据库，支持 RAG 知识增强
- [ ] 增加 WebSocket 支持，双向实时通信
- [ ] 多租户隔离，满足企业版需求

---

## 🚀 快速启动

```bash
# 克隆项目
git clone <repo-url>
cd CodeWiz

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入必要配置

# 启动服务
docker-compose up -d --build

# 访问应用
open http://localhost
```

---

## 📄 License

MIT License# CodeWiz
