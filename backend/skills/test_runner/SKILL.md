---
name: test_runner
description: 测试执行工具，用于运行 vitest 单元测试、查看测试结果。当代码生成后需要验证正确性、或需要添加新测试用例时使用此工具。
type: tool
---

## 测试框架

Conduit 项目使用 **Vitest** 作为测试框架（前端 + 后端共享同一配置）。

- 配置文件: `vitest.config.js`（项目根）
- 前端测试: `frontend/src/helpers/*.test.js`
- 后端测试: `backend/helper/*.test.js`

## 测试约定

- 运行测试: `npx vitest`（项目根目录）
- 运行指定文件: `npx vitest run <file>`
- 前端测试: `cd frontend && npx vitest run`
- 后端测试: `cd backend && npx vitest run`

## 工具说明

1. **run_tests** — 运行 vitest 测试
2. **check_lint** — 运行 ESLint 检查
