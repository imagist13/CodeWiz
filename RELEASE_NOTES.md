## CodePilot v0.54.0

> 本版本补齐服务商生态：新增 DeepSeek 独立预设，OpenAI OAuth 加入 GPT-5.5，小米 MiMo 两个套餐升级到 V2.5-Pro，同时修掉切换服务商时的环境变量残留问题。

### 新增功能

- **DeepSeek 服务商** — 在服务商列表里新增 DeepSeek 独立预设，走官方 Anthropic 兼容端点 `api.deepseek.com/anthropic`，只需填 Key 即用。默认主模型 DeepSeek V4 Pro，Haiku 档位映射到更便宜的 DeepSeek V4 Flash，压缩/总结这类辅助调用能自动走便宜档
- **OpenAI OAuth 支持 GPT-5.5** — ChatGPT Plus/Pro 授权登录后，模型下拉里新增 GPT-5.5（排在 GPT-5.4 之上），新会话未指定模型时默认用 GPT-5.5

### 修复问题

- **切换服务商时环境变量残留** — 之前如果用户在系统环境里设过 DeepSeek 文档里的 `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK` / `CLAUDE_CODE_EFFORT_LEVEL`，切到其它服务商后这两个变量仍会带到子进程里，影响其它服务商的请求行为。现在切换服务商时会连同这两个 key 一起清掉，避免跨服务商污染

### 优化改进

- **小米 MiMo 升级到 V2.5-Pro** — 按量付费和 Token Plan 两个预设里的默认模型从 `mimo-v2-pro` 全部切到 `mimo-v2.5-pro`，界面上显示名也同步更新为 MiMo-V2.5-Pro

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.54.0/CodePilot-0.54.0-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.54.0/CodePilot-0.54.0-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.54.0/CodePilot.Setup.0.54.0.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter 等）
- 推荐安装 Claude Code CLI 以获得完整功能
