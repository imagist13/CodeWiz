---
name: schema_sync
description: 跨栈一致性工具，用于追踪后端字段变更并自动驱动前端类型更新。当后端模型添加/修改了字段，或需要保持前后端类型一致时使用此工具。
type: tool
---

## 前后端 Schema 映射

Conduit 的 Article/User/Comment 等实体同时存在于后端（Sequelize Model）和前端（React State）。

### Article 实体

后端 `backend/models/Article.js`:
- slug, title, description, body
- createdAt, updatedAt, userId
- 自动创建: TagList (many-to-many), Favorites (many-to-many)

前端: Article.jsx 从 `/api/articles/:slug` 响应中获取

### User 实体

后端 `backend/models/User.js`:
- email, username, bio, image, password
- toJSON() 移除 id, password

前端 AuthContext: `{ headers, isAuth, loggedUser: { username, email, bio, image } }`

## 工具说明

1. **schema_sync_check** — 检查前后端字段是否一致
2. **schema_sync_update** — 同步更新前端类型定义
3. **schema_diff** — 对比两个版本的 Schema 差异
