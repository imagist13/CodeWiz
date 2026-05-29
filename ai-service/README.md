# AI Service 说明文档

## 概述

AI Service 是 **CodeWiz** 项目的核心组件之一，是一个基于 FastAPI 构建的 Python 微服务。它负责处理 AI 对话交互、代码沙箱管理以及与 LLM（大语言模型）的通信。项目默认运行在 `http://localhost:8000`。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| Web 框架 | FastAPI + Uvicorn |
| LLM 集成 | LangChain + Silicon Flow API |
| 数据库 | PostgreSQL + SQLAlchemy ORM |
| 认证 | JWT（通过 Go Backend 验证） |
| 工具系统 | 自定义 Tool Registry（Agent Tools） |
| 沙箱管理 | 用户目录操作（基于 votx-agent 模式） |

---

## 项目结构

```
ai-service/
├── app/
│   ├── main.py                      # FastAPI 入口，注册路由、中间件
│   ├── core/
│   │   ├── config.py                # 配置管理（.env / 环境变量）
│   │   ├── database.py              # SQLAlchemy 数据库连接
│   │   └── security.py              # JWT 鉴权（委托 Go Backend 验证）
│   ├── api/
│   │   ├── chat.py                  # 对话 API（流式 SSE）
│   │   └── conversation.py           # 会话管理 API
│   ├── harness/
│   │   ├── agent.py                 # LangChain Agent Loop（工具调用循环）
│   │   ├── tools.py                 # 工具注册表（所有 AI 可调用的工具）
│   │   ├── _common.py                # 公共模块（路径安全、命令安全、SSRF 防护）
│   ├── models/
│   │   ├── database.py              # SQLAlchemy 数据模型
│   │   └── schemas.py               # Pydantic 请求/响应模型
│   └── llm/
│       └── silicon_flow.py          # Silicon Flow LLM 客户端
├── requirements.txt                 # Python 依赖
└── uploads/                         # 上传文件目录（需手动创建）
```

---

## 核心功能模块

### 1. 对话服务（Chat）

**入口**: `POST /api/chat`

核心职责：接收用户消息，通过 LangChain Agent 与 LLM 交互，支持流式 SSE 输出和工具调用。

**工作流程**：
1. 验证用户 JWT Token（通过 Go Backend）
2. 构建消息列表，注入 System Prompt
3. 启动 Agent Loop，LLM 生成回复
4. 如果 LLM 调用工具 → 执行工具 → 返回结果 → 继续对话
5. 以 SSE 流式返回文本、工具调用、工具结果等事件
6. 将用户消息和助手回复持久化到数据库

**SSE 事件类型**：

| 事件类型 | 说明 |
|----------|------|
| `text-start` | 开始一段文本输出 |
| `text-delta` | 文本内容增量 |
| `text-end` | 文本输出结束 |
| `tool-input-start` | 开始一个工具调用 |
| `tool-input-delta` | 工具参数增量 |
| `tool-input-available` | 工具调用就绪 |
| `tool-output-available` | 工具结果返回 |
| `finish` | 对话结束 |
| `error` | 发生错误 |

### 2. 工具系统（Tools）

AI Agent 可调用的所有工具定义在 `app/harness/tools.py` 中：

| 工具名称 | 功能 |
|----------|------|
| `bashTool` | 在用户目录执行 Shell 命令 |
| `readFileTool` | 读取文件内容 |
| `writeFileTool` | 写入文件 |
| `searchFilesTool` | 在目录中搜索文本 |
| `listFilesTool` | 列出目录文件 |
| `replaceInFileTool` | 替换文件中的文本 |
| `appendToFileTool` | 追加内容到文件 |
| `makeDirectoryTool` | 创建目录 |
| `movePathTool` | 移动/重命名文件或目录 |
| `deletePathTool` | 删除文件或目录 |
| `checkAppTool` | 检查端口上的应用状态 |
| `startPreviewTool` | 启动用户目录的预览服务 |
| `getPreviewUrlTool` | 获取当前预览 URL |
| `commitTool` | Git 提交更改 |

### 3. 用户目录操作

基于 votx-agent 模式，所有工具在用户目录下操作：

**用户目录结构**：`user_data_root/<user_id>/`

**安全特性**：
- 路径安全：相对路径以项目根为基准，防止路径穿越
- 命令安全：危险命令拦截（rm -rf、dd、mkfs 等）
- SSRF 防护：URL 校验，防止访问内网地址
- shell=False：使用 shlex 安全解析命令
- 环境变量清理：剥离敏感信息

**预览服务**：端口范围 31000-31999，由路径哈希决定

### 4. 会话管理（Conversation）

**入口**: `GET/POST /api/repos/{repo_id}/conversations`

管理项目的对话历史，支持创建、查询、删除会话。

### 5. 认证（Auth）

**入口**: `GET /api/auth/me`

通过调用 Go Backend 的 `/auth/me` 接口验证 JWT Token 并获取用户信息。

---

## API 路由总览

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `POST` | `/api/chat` | 发送对话消息（流式） |
| `GET` | `/api/auth/me` | 获取当前用户信息 |
| `GET` | `/api/repos/{repo_id}/conversations` | 获取会话列表 |
| `POST` | `/api/repos/{repo_id}/conversations` | 创建新会话 |
| `GET` | `/api/repos/{repo_id}/conversations/{id}` | 获取会话详情（含消息） |
| `DELETE` | `/api/repos/{repo_id}/conversations/{id}` | 删除会话 |

---

## 配置说明

通过 `.env` 文件配置，查找路径优先级：
1. `ai-service/.env`
2. `CodeWiz/.env`（项目根目录）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `APP_NAME` | `CodeWiz AI Service` | 应用名称 |
| `DEBUG` | `False` | 调试模式 |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/codewiz` | 数据库连接（支持 libpq 格式） |
| `JWT_SECRET` | `codewiz-dev-secret-change-in-prod` | JWT 密钥（需与 Go Backend 一致） |
| `BACKEND_URL` | `http://localhost:8080` | Go Backend 地址 |
| `SILICON_FLOW_API_URL` | `https://api.siliconflow.cn/v1` | Silicon Flow API 地址 |
| `SILICON_FLOW_API_KEY` | *(空)* | **必填**，Silicon Flow API Key |
| `LLM_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | LLM 模型名称 |
| `UPLOAD_DIR` | `./uploads` | 上传文件目录 |

---

## 数据库模型

### User
用户信息（通过 Go Backend 管理）。

### Project
项目信息，包含 `vm_id`、`source_repo_id`、`preview_url` 等字段。

### Conversation
会话记录，关联项目和用户。

### Message
消息记录，包含角色（user/assistant）、内容、工具调用信息。

---

## 启动方式

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 与 Go Backend 的交互

AI Service 与 Go Backend 紧密协作：

1. **认证**：AI Service 收到请求后，将 JWT Token 转发给 Go Backend 的 `/auth/me` 验证
2. **项目元数据**：`updateProjectPreviewTool` 将预览 URL 通过 Go Backend 的 `PUT /api/projects/{repo_id}/vm` 保存
3. **共享数据库**：AI Service 和 Go Backend 共享同一个 PostgreSQL 数据库

---

## 工作流程示例

用户请求："帮我创建一个 HTML 页面"

```
用户  →  FastAPI (/api/chat)  →  Agent Loop  →  LLM (Silicon Flow)
                                              ↓
                                        writeFileTool (写 index.html)
                                        ↓
                                        startPreviewTool (启动预览服务器)
                                        ↓
                                        返回预览地址给用户
```
