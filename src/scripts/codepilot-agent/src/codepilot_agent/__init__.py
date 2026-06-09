"""CodePilot Python Agent — multi-turn tool-use agent runtime via Anthropic API.

Modules:
    chat     — One-shot streaming chat (Phase 1 compatibility)
    agent    — Multi-turn agent loop with tool calls (Phase 2)
    session  — Conversation history and session state
    tools    — Built-in tool definitions (Read, Write, Edit, Bash, Glob, Grep)
    provider — Provider credential resolution
    cli      — CLI entry point (one-shot + session mode)
"""

from __future__ import annotations

__version__ = "0.2.0"
