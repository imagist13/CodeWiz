# Adorable Backend

基于 Go + Gin + GORM 构建的后端服务，提供用户认证、项目管理、AI 对话会话等功能。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Go | 1.21+ | 编程语言 |
| Gin | v1.9.1 | HTTP Web 框架 |
| GORM | v1.25.5 | ORM 框架 |
| PostgreSQL | - | 数据库 |
| JWT | v5.2.0 | 认证令牌 |

## 快速开始

### 环境要求

- Go 1.21+
- PostgreSQL 14+
- Docker (可选)

### 配置

在项目根目录创建 `.env` 文件：

```env
SERVER_PORT=8080
DATABASE_URL=host=localhost user=postgres password=postgres dbname=adorable port=5432 sslmode=disable
JWT_SECRET=your-secret-key-here
```

### 启动服务

```bash
# 直接运行
go run cmd/server/main.go

# Docker 运行
docker build -t adorable-backend .
docker run -p 8080:8080 --env-file .env adorable-backend
```

## 项目结构

```
backend/
├── cmd/server/          # 应用入口
├── internal/
│   ├── config/          # 配置管理
│   ├── models/          # 数据模型
│   ├── handlers/        # HTTP 处理器
│   ├── middleware/      # 中间件
│   ├── repositories/    # 数据访问层
│   ├── services/        # 业务逻辑层
│   └── router/          # 路由配置
└── pkg/response/        # 响应工具
```

## 架构设计

采用分层架构，分离关注点：

```
请求 → Router → Middleware → Handler → Service → Repository → Database
```

- **Handler**: 接收请求、参数验证、调用服务层
- **Service**: 业务逻辑、数据转换、验证
- **Repository**: 数据库 CRUD 操作
- **Model**: GORM 数据模型定义

## 数据模型

### User (用户)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| email | string | 邮箱 (唯一) |
| password | string | 加密密码 |
| name | string | 显示名称 |
| avatar_url | string | 头像 URL |

### Project (项目)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 所有者 ID |
| name | string | 项目名称 |
| description | string | 项目描述 |
| git_url | string | Git 仓库 URL |
| is_public | bool | 是否公开 |

### Conversation (会话)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| project_id | UUID | 关联项目 ID |
| title | string | 会话标题 |

### Message (消息)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| conversation_id | UUID | 所属会话 |
| role | string | 角色 (user/assistant/tool) |
| content | string | 消息内容 |
| tool_calls | JSONB | 工具调用数据 |

### FileUpload (文件上传)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 上传者 ID |
| filename | string | 原始文件名 |
| file_path | string | 存储路径 |
| file_size | int64 | 文件大小 |

## API 文档

### 认证接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/auth/register` | 用户注册 | 否 |
| POST | `/auth/login` | 用户登录 | 否 |
| POST | `/auth/logout` | 登出 | 否 |
| GET | `/auth/me` | 获取当前用户 | 是 |

### 用户接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/user` | 获取用户资料 |
| PUT | `/api/user` | 更新用户资料 |

### 项目接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects` | 列出用户项目 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/:id` | 获取项目详情 |
| PUT | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |

### 会话接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/repos/:repoId/conversations` | 列出会话 |
| POST | `/api/repos/:repoId/conversations` | 创建会话 |
| GET | `/api/repos/:repoId/conversations/:id` | 获取会话 |
| DELETE | `/api/repos/:repoId/conversations/:id` | 删除会话 |

### 消息接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/conversations/:id/messages` | 获取会话消息 |

## 认证方式

采用 JWT Bearer Token 认证。

**请求头格式：**
```
Authorization: Bearer <token>
```

**Token 有效期：** 7 天

## 统一响应格式

```json
{
    "code": 200,
    "message": "success",
    "data": {}
}
```

错误响应：
```json
{
    "code": 400,
    "message": "error message",
    "data": null
}
```

## 开发指南

### 添加新接口

1. 在 `models/` 中定义数据模型
2. 在 `repositories/` 中实现数据访问方法
3. 在 `services/` 中实现业务逻辑
4. 在 `handlers/` 中实现 HTTP 处理器
5. 在 `router/router.go` 中注册路由

### 数据库迁移

项目启动时会自动执行 GORM AutoMigrate 创建/更新表结构。

### 依赖管理

```bash
# 添加依赖
go get github.com/package/name

# 更新依赖
go mod tidy
```
