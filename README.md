# CodeWiz — AI Desktop Coding Assistant

<p align="center">
  <a href="https://github.com/codewiz/codewiz/stargazers"><img src="https://img.shields.io/github/stars/codewiz/codewiz?style=social" alt="Stars"></a>
  <a href="https://github.com/codewiz/codewiz/network/members"><img src="https://img.shields.io/github/forks/codewiz/codewiz?style=social" alt="Forks"></a>
  <img src="https://img.shields.io/github/license/codewiz/codewiz?style=flat-square" alt="License">
</p>

<p align="center">
  <strong>CodeWiz</strong> is a cross-platform desktop AI coding assistant. Chat with AI, execute code, and manage your projects — all in one app.
</p>

<p align="center">
  <a href="#-quick-start"><strong>Quick Start</strong></a>&nbsp;&nbsp;·&nbsp;
  <a href="#-features"><strong>Features</strong></a>&nbsp;&nbsp;·&nbsp;
  <a href="#-tech-stack"><strong>Tech Stack</strong></a>&nbsp;&nbsp;·&nbsp;
  <a href="#-project-structure"><strong>Project Structure</strong></a>&nbsp;&nbsp;·&nbsp;
  <a href="#-skills-marketplace"><strong>Skills</strong></a>&nbsp;&nbsp;·&nbsp;
  <a href="#-development"><strong>Development</strong></a>
</p>

---

## What is CodeWiz?

CodeWiz is a desktop AI coding assistant built with Electron and FastAPI. It brings together an intelligent AI chat interface, a code execution engine, and a rich skills marketplace — all running locally on your machine.

With Hermes you can:

- Chat with AI models (OpenAI GPT-4o, Anthropic Claude, DeepSeek)
- Execute code in a sandboxed environment directly from the desktop
- Browse and install skills from the marketplace to extend AI capabilities
- Manage conversations, repositories, and projects from a polished UI
- Get real-time streaming responses via SSE

---

## Features

### AI Chat Interface
SSE-powered streaming chat with support for multiple LLM providers. Multi-round conversation memory with automatic context management.

### Code Execution Engine
Run Python code directly within CodeWiz. The execution harness leverages tree-sitter for code analysis and supports a growing library of execution tools.

### Skills Marketplace
18 built-in skills covering the full development lifecycle:

| Category | Skills |
|----------|--------|
| **Code Quality** | Code Auditor, Test Fixing, Review Implementing |
| **Code Transformation** | Code Refactor, Code Transfer, File Operations |
| **Documentation** | Codebase Documenter, Technical Doc Creator, Flowchart Creator, Timeline Creator, Architecture Diagram Creator, Dashboard Creator |
| **Project Management** | Feature Planning, Project Bootstrapper, Ensemble Solving, Conversation Analyzer |
| **Automation** | Git Pushing, Code Execution |

### Multi-LLM Support
Switch between OpenAI GPT-4o, Anthropic Claude, and DeepSeek through a unified interface. Configure your preferred provider and model in settings.

### Desktop Integration
Built on Electron with native OS integration, CodeWiz runs as a native desktop application on Windows (with macOS/Linux support).

---

## Tech Stack

```
┌─────────────────────────────────────────────┐
│              Electron Desktop App             │
│         React + TypeScript + Zustand         │
│             Tailwind CSS + Ant Design         │
└────────────────────┬────────────────────────┘
                     │ HTTP / SSE
                     ▼
┌─────────────────────────────────────────────┐
│              FastAPI Backend                  │
│         Python 3.11+ · SQLAlchemy 2.0         │
│              SQLite (aiosqlite)               │
│         LangChain · tree-sitter              │
└─────────────────────────────────────────────┘
```

| Layer | Technology |
|-------|------------|
| **Desktop Framework** | Electron 31.x + electron-vite |
| **Frontend** | React 18, TypeScript 5, Tailwind CSS 4, Ant Design 6 |
| **State Management** | Zustand 4 |
| **Backend** | FastAPI (Python 3.11+), Uvicorn, SQLAlchemy 2.0, aiosqlite |
| **AI / LLM** | LangChain (OpenAI, Anthropic, DeepSeek adapters) |
| **Code Analysis** | tree-sitter-languages |
| **Build** | electron-builder, pnpm |

---

## Project Structure

```
CodeWiz/
├── electron/                    # Electron desktop app
│   └── src/
│       ├── main/               # Main process
│       ├── preload/            # Preload scripts (IPC bridge)
│       └── renderer/           # React UI
│           ├── components/     # React components
│           ├── pages/         # App pages (Chat, Settings, etc.)
│           ├── store/          # Zustand state stores
│           ├── hooks/          # Custom React hooks
│           ├── utils/         # API client, helpers
│           └── styles/        # Global styles, theme
│
├── backend/                    # Python FastAPI backend
│   ├── api/                    # API route handlers
│   │   ├── chat.py             # Chat & SSE streaming
│   │   ├── users.py            # User authentication
│   │   ├── files.py            # File operations
│   │   ├── conversations.py    # Conversation management
│   │   ├── tasks.py            # Task management
│   │   └── config.py           # Configuration endpoints
│   ├── core/                  # Core utilities
│   │   ├── config.py           # App configuration
│   │   ├── security.py         # JWT auth, password hashing
│   │   ├── database.py        # SQLAlchemy setup
│   │   └── models.py           # ORM models
│   ├── runcore/               # Code execution engine
│   │   ├── agent.py           # Agent execution loop
│   │   ├── llm/               # LLM adapters (OpenAI, Anthropic, DeepSeek)
│   │   ├── memory/             # Context management & compression
│   │   └── tools/              # Tool registry and implementations
│   ├── skills/                # Skills system
│   │   └── marketplace/        # Built-in skills (18 total)
│   │       ├── code-auditor/
│   │       ├── code-execution/
│   │       ├── code-refactor/
│   │       ├── code-transfer/
│   │       ├── codebase-documenter/
│   │       ├── conversation-analyzer/
│   │       ├── dashboard-creator/
│   │       ├── ensemble-solving/
│   │       ├── feature-planning/
│   │       ├── file-operations/
│   │       ├── flowchart-creator/
│   │       ├── git-pushing/
│   │       ├── project-bootstrapper/
│   │       ├── review-implementing/
│   │       ├── technical-doc-creator/
│   │       ├── test-fixing/
│   │       ├── timeline-creator/
│   │       └── architecture-diagram-creator/
│   ├── cron/                  # Scheduled tasks
│   └── main.py                # FastAPI app entry point
│
├── config/                    # Configuration files
│   ├── config_core.json       # Core settings
│   └── user_defaults.json     # Default user preferences
│
├── data/                      # Runtime data (user data, databases)
├── build/                     # App icons and build resources
└── dist/                      # Build output (generated)
```

---

## Skills Marketplace

CodeWiz ships with 18 built-in skills:

### Code Quality
- **Code Auditor** — Analyze code for bugs, performance issues, and best practices
- **Test Fixing** — Auto-fix failing tests with context-aware suggestions
- **Review Implementing** — Transform code review comments into actionable fixes

### Code Transformation
- **Code Refactor** — Intelligent refactoring with full codebase awareness
- **Code Transfer** — Migrate code between frameworks and languages
- **File Operations** — Batch file operations with pattern matching

### Documentation
- **Codebase Documenter** — Generate comprehensive project documentation
- **Technical Doc Creator** — Create detailed technical specifications
- **Flowchart Creator** — Generate SVG flowcharts from code logic
- **Timeline Creator** — Build visual project timelines
- **Architecture Diagram Creator** — Create system architecture diagrams
- **Dashboard Creator** — Build interactive data dashboards

### Project Management
- **Feature Planning** — Structured feature planning with acceptance criteria
- **Project Bootstrapper** — Scaffold new projects with best practices
- **Ensemble Solving** — Multi-agent collaborative problem solving
- **Conversation Analyzer** — Analyze and optimize AI conversation patterns

### Automation
- **Git Pushing** — Smart git commit and push with conventional commits
- **Code Execution** — Execute and analyze Python code in sandbox

---

## Quick Start

### Prerequisites

| Dependency | Version |
|------------|---------|
| Node.js | 18+ |
| pnpm | 9+ |
| Python | 3.11+ |

### 1. Install dependencies

```bash
# Install Node.js dependencies
pnpm install

# Install Python dependencies
cd backend
pip install -r requirements.txt
cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your API keys:

```env
HERMES_PROVIDER=openai
HERMES_MODEL=gpt-4o
HERMES_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
HERMES_SECRET_KEY=your-random-secret-key
```

### 3. Run in development mode

```bash
npm run dev
```

This starts both the Electron app and the FastAPI backend concurrently:
- **Desktop App** — `electron-vite` dev server
- **Backend** — FastAPI on `http://localhost:1478`

### 4. Build for distribution

```bash
npm run dist
```

Outputs a Windows NSIS installer to `dist/`.

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HERMES_PROVIDER` | Yes | `openai` | LLM provider: `openai`, `anthropic`, `deepseek` |
| `HERMES_MODEL` | No | `gpt-4o` | Model name |
| `HERMES_API_KEY` | Yes | — | API key for the selected provider |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key |
| `DEEPSEEK_API_KEY` | No | — | DeepSeek API key |
| `HERMES_SECRET_KEY` | No | — | JWT signing secret |
| `BACKEND_HOST` | No | `127.0.0.1` | Backend bind host |
| `BACKEND_PORT` | No | `1478` | Backend bind port |
| `HERMES_DATA_DIR` | No | `data/` | User data directory |

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

```bash
# 1. Fork the repository
# 2. Create your feature branch
git checkout -b feature/amazing-feature

# 3. Commit your changes
git commit -m 'feat: add amazing feature'

# 4. Push to the branch
git push origin feature/amazing-feature

# 5. Open a Pull Request
```

### Code Style

- TypeScript → ESLint + Prettier
- Python → PEP 8, use `ruff` for linting
- Commit messages → Conventional Commits

---

## License

MIT License — see [LICENSE](LICENSE).
