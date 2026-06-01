## ClawHub & SkillHub 使用说明

### 一、概述

ClawHub 是 OpenClaw 的公共技能注册中心，用于搜索、安装、更新和发布 AI Agent 技能包。科大讯飞开源了企业级私有化技能包管理平台 SkillHub，支持私有化部署，并完全兼容 ClawHub CLI 协议。你可以将自己的 SkillHub 服务部署在内网，作为团队私有的技能注册中心。


### 二、环境准备

**前提条件：**
- Node.js v18 及以上版本
- npm 或 pnpm 包管理器

**安装 ClawHub CLI：**

```bash
npm i -g clawhub
```

或使用 pnpm：

```bash
pnpm add -g clawhub
```

验证安装：

```bash
clawhub --version
```


### 三、私有化部署 SkillHub 服务

#### 3.1 部署 SkillHub 服务端

参考科大讯飞 SkillHub 开源项目进行私有化部署（具体部署方式参见 GitHub 仓库文档），部署完成后获得服务地址，例如 `http://192.168.0.27/`。

#### 3.2 注册账户

1. 访问服务地址，如 `http://192.168.0.10/` 
2. 点击「登录」
3. 点击「注册账号」
4. 选择「本地账户」完成注册

#### 3.3 生成 API Token

1. 登录后进入控制台
2. 找到 API Tokens 管理页面
3. 点击「Create token」生成 Token
4. 复制生成的 Token（通常以 `clh_` 开头）

#### 3.4 配置 CLI 指向私有 Registry

通过环境变量设置技能包注册中心地址：

```bash
export CLAWHUB_REGISTRY=http://192.168.0.27/
```

#### 3.5 登录 CLI

使用生成的 Token 完成登录：

```bash
clawhub login --token <你的Token>
```

登录成功后会显示 `✔ OK. Logged in as @your-username`。


### 四、发布技能包

#### 4.1 准备技能包目录

技能包需包含 `SKILL.md` 文件，示例如下：

```markdown
---
name: crm-manager-skill
description: CRM 客户管理技能，用于客户信息查询、合同管理和销售数据分析
version: 1.0.0
---

# 技能使用说明

此处撰写技能的详细使用说明和提示词...
```

目录结构示例：
```
crm-manager-skill/
├── SKILL.md      # 必需，技能元信息文件
├── README.md     # 可选
└── scripts/      # 可选，可执行脚本目录
```

#### 4.2 发布技能

```bash
clawhub publish ./crm-manager-skill \
  --slug crm-manager-skill \
  --name "crm-manager-skill" \
  --version 1.0.0
```

```bash
clawhub publish "D:\work\hv-agent-coach-assistant\agent-skills\video-script-writer" --slug video-script-writer --name "video-script-writer" --version 0.0.1-SNAPSHOT
```

**参数说明：**
| 参数 | 说明 |
|------|------|
| `--slug` | 技能唯一标识符（小写字母 + 短横线） |
| `--name` | 显示名称 |
| `--version` | 语义化版本号 |

发布成功后会显示成功信息和技能详情页地址。


### 五、安装技能包

#### 5.1 确认 Registry 配置

确保环境变量已正确设置：

```bash
export CLAWHUB_REGISTRY=http://192.168.0.27/
```

#### 5.2 安装技能

```bash
clawhub install crm-manager-skill
```

#### 5.3 其他常用命令

| 命令 | 说明 |
|------|------|
| `clawhub search "查询关键词"` | 搜索技能（支持自然语言） |
| `clawhub update --all` | 更新所有已安装技能 |
| `clawhub list` | 列出已安装技能 |
| `clawhub whoami` | 查看当前登录用户 |
| `clawhub logout` | 退出登录 |


### 六、ClawHub vs SkillHub 对比

| 特性 | ClawHub（公共） | SkillHub（私有化部署） |
|------|----------------|----------------------|
| 部署方式 | SaaS 云服务 | 自托管，部署在自有基础设施上 |
| 数据主权 | 数据托管在云端 | 数据完全掌握在自己手中，不离开企业网络 |
| 适用场景 | 个人开发者、开源项目 | 企业团队、数据敏感场景 |
| 许可证 | MIT | Apache 2.0 |
| CLI 兼容 | 原生支持 | 完全兼容 ClawHub CLI 协议 |
| 团队管理 | 不支持 | 支持命名空间、成员角色和发布策略 |
| 审核机制 | 基础审核 | 分级审核 + 审计日志 |
| 安全扫描 | 社区驱动 | 集成自动化安全扫描流水线 |


### 七、私有化部署环境变量参考

| 环境变量 | 说明 |
|----------|------|
| `CLAWHUB_REGISTRY` | 注册中心 API 基础 URL |
| `CLAWHUB_SITE` | 网站基础 URL（浏览器登录） |
| `CLAWHUB_WORKDIR` | 工作目录（默认当前目录） |
| `CLAWHUB_CONFIG_PATH` | 配置文件路径（覆盖默认位置） |

**配置示例：**

```bash
# 设置私有注册中心地址
export CLAWHUB_REGISTRY=http://192.168.0.27/

# 设置工作目录（可选）
export CLAWHUB_WORKDIR=/path/to/workspace

# 登录
clawhub login --token your_token_here

# 发布技能
clawhub publish ./your-skill --slug your-skill --name "Your Skill" --version 1.0.0

# 安装技能
clawhub install your-skill
```


### 八、常见问题

**Q1：Token 认证失败怎么办？**
确认 Token 已正确复制（注意 `--token` 后面有空格），且 Token 未过期。

**Q2：技能发布失败？**
检查技能目录是否包含 `SKILL.md` 文件，Slug 是否符合小写字母 + 短横线格式，以及是否已登录。

**Q3：如何更新已发布技能？**
修改 `SKILL.md` 中的 `version` 字段（遵循语义化版本号），重新执行 `clawhub publish` 即可。

**Q4：私有化部署的 SkillHub 支持哪些存储后端？**
支持本地文件系统、S3 和 MinIO，可通过配置灵活切换。

**Q5：如何验证技能发布成功？**
在另一台机器上配置相同的 `CLAWHUB_REGISTRY`，执行 `clawhub search <技能名>` 确认返回结果包含该技能。