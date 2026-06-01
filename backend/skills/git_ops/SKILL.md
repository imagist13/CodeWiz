---
name: git_ops
description: Git 操作工具，用于查看 Git 状态、提交代码、创建分支、推送远程。当完成功能开发需要提交代码时使用此工具。
type: tool
---

## Git 工作流

Conduit 仓库使用 Git 管理代码，标准工作流：

1. `git status` — 查看当前变更
2. `git diff` — 查看详细变更
3. `git add <files>` — 暂存文件
4. `git commit -m "<message>"` — 提交
5. `git push` — 推送到远程

## 工具说明

1. **git_status** — 查看工作区状态
2. **git_diff** — 查看文件变更
3. **git_commit** — 提交代码（自动 git add 所有变更）
4. **git_create_branch** — 创建新分支
5. **git_push** — 推送到远程

## 安全约束

- 不允许强制推送 (`git push --force`)
- 不允许删除远程分支
- 不允许操作 .git 目录外的文件
