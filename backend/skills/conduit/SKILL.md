---
name: conduit
description: Conduit 全栈项目专属操作工具，用于查询前后端 Schema 映射、路由结构、数据模型。当需要了解 Article/User/Comment 等实体的完整调用链，或需要追踪字段从前端到后端的完整路径时使用。
type: tool
---

## Conduit 项目架构

Conduit 是一个 Medium 克隆的全栈应用：

- **Backend**: Express.js + Sequelize ORM + PostgreSQL，端口 3001
- **Frontend**: React 19 + Vite，端口 3000，前端通过代理访问后端 API

### 后端结构

```
backend/
  controllers/   # 请求处理逻辑
  routes/        # Express 路由定义
  models/        # Sequelize 模型（User, Article, Comment, Tag）
  middleware/    # JWT 认证 + 错误处理
  helper/        # bcrypt/jwt/自定义错误
  migrations/    # 数据库迁移
```

### 前端结构

```
frontend/src/
  services/      # API 调用层（axios 封装）
  context/       # AuthContext + FeedContext
  components/    # 31 个可复用组件
  routes/        # 页面组件
```

### 关键 API 约定

- 所有 API 前缀 `/api`
- 认证: `Authorization: Token <jwt_token>`
- 响应: `{ errors: { body: [...] } }` 表示错误
- 成功: `{ user: {...} }`, `{ article: {...} }`, `{ articles: [...] }`

### Schema 映射约定

- 后端 Sequelize 模型字段 → 前端 JSON 字段
- 后端路由 `/api/articles/:slug` → 前端 `services/getArticle.js`
- JWT payload: `{ username, email }`

## 工具说明

1. **conduit_schema_map** — 查看实体的完整字段映射
2. **conduit_api_tree** — 查看完整 API 路由树
3. **conduit_entity_trace** — 追踪实体的前后端完整调用链
