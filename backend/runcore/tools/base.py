"""
Base classes for tools — ToolResult, Tool, and shared tool utilities.

Provides a consistent interface for all tool implementations
with built-in input schema validation and unified path resolution.
"""
from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared constants (duplicated across scanner.py / search.py / legacy_tools)
# ---------------------------------------------------------------------------

# Directories that should never be entered during file operations
SKIP_DIRS = frozenset({
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", "target", "bin", "obj", ".pytest_cache",
    ".mypy_cache", ".tox", ".coverage", ".eggs", "*.egg-info",
})

# File extensions considered "code" for search/indexing purposes
CODE_EXTENSIONS = frozenset({
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift",
    ".kt", ".scala", ".lua", ".pl", ".sql", ".sh", ".bash", ".zsh",
    ".yaml", ".yml", ".json", ".toml", ".xml", ".html", ".css",
    ".scss", ".less", ".vue", ".svelte", ".dart",
    ".ex", ".exs", ".erl", ".hs", ".r", ".md", ".rst",
})

# ---------------------------------------------------------------------------
# Shared path resolution utility
# ---------------------------------------------------------------------------

def _safe_resolve(path_str: str, username: str) -> Path:
    """Resolve a path string within the current user's sandbox.

    ALL file/search tools MUST use this instead of calling safe_path directly,
    so that:
      1. The workspace_root thread-local (set per-request) is always respected.
      2. The "." shorthand is handled correctly — it resolves to the workspace_root,
         never to get_user_dir() bypassing safe_path().
      3. Every path hits safe_path() and gets its symlink + containment checks.

    Args:
        path_str: Relative or absolute path string (may be "." or "").
        username: Current user identifier.

    Returns:
        Path object resolved within the sandbox.
    """
    from runcore.security import safe_path, get_workspace_root

    # Normalize "." and "" to empty so safe_path uses the relative path branch.
    # This ensures workspace_root is respected rather than user_dir.
    normalized = path_str.strip() if path_str not in (".", "") else ""
    resolved = safe_path(username, normalized if normalized else ".")
    return Path(resolved)


# ---------------------------------------------------------------------------
# ToolResult — unified return type for all tool executions
# ---------------------------------------------------------------------------

@dataclass
class ToolResult:
    """Result of a tool execution.

    Mirrors codewiz-agent's ToolResult design for consistency.

    Attributes:
        success: Whether the tool execution succeeded.
        content: Human-readable result text (shown to LLM).
        error: Error message if success is False.
        metadata: Structured data about the execution
                  (e.g. file size, line count, match count).
    """
    success: bool
    content: str = ""
    error: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict for JSON transport."""
        return {
            "success": self.success,
            "content": self.content,
            "error": self.error,
            "metadata": self.metadata,
        }

    @classmethod
    def ok(cls, content: str, metadata: Optional[dict[str, Any]] = None) -> "ToolResult":
        """Factory: create a successful result."""
        return cls(success=True, content=content, metadata=metadata or {})

    @classmethod
    def err(cls, error: str, metadata: Optional[dict[str, Any]] = None) -> "ToolResult":
        """Factory: create an error result."""
        return cls(success=False, error=error, metadata=metadata or {})

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    @property
    def is_ok(self) -> bool:
        return self.success

    @property
    def is_error(self) -> bool:
        return not self.success


# ---------------------------------------------------------------------------
# Tool — abstract base class for all tools
# ---------------------------------------------------------------------------

class Tool(ABC):
    """Abstract base class for all agent tools.

    Subclass this to implement a new tool.  Define name, description,
    input_schema, and execute().  Subclasses are automatically validated
    via validate_input().

    Example:
        class ReadFileTool(Tool):
            @property
            def name(self) -> str:
                return "read_file"

            @property
            def description(self) -> str:
                return "Read the contents of a file."

            @property
            def input_schema(self) -> dict[str, Any]:
                return {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "lines": {"type": "integer", "default": 500}
                    },
                    "required": ["path"]
                }

            def execute(self, input_data: dict[str, Any]) -> ToolResult:
                # ...
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for this tool. Used in tool_call messages."""

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description shown to the LLM."""

    @property
    @abstractmethod
    def input_schema(self) -> dict[str, Any]:
        """JSON Schema for the tool's input arguments."""

    @abstractmethod
    def execute(self, input_data: dict[str, Any], username: str) -> ToolResult:
        """Execute the tool with the given validated input.

        Args:
            input_data: Arguments validated against input_schema.
            username: Current user identifier (for sandboxing).

        Returns:
            ToolResult with the execution outcome.
        """

    # Optional: max calls per tool-use round (enforced by registry)
    per_round_limit: Optional[int] = None

    def validate_input(self, input_data: dict[str, Any]) -> list[str]:
        """Validate input_data against the JSON schema.

        Checks required fields and basic type correctness.

        Args:
            input_data: Raw input from the LLM.

        Returns:
            List of error messages (empty if valid).
        """
        errors: list[str] = []
        schema = self.input_schema

        required = schema.get("required", [])
        for field_name in required:
            if field_name not in input_data:
                errors.append(f"Missing required field: '{field_name}'")

        properties = schema.get("properties", {})
        for field_name, value in input_data.items():
            if field_name in properties:
                expected_type = properties[field_name].get("type")
                if expected_type and not self._check_type(value, expected_type):
                    errors.append(
                        f"Field '{field_name}' has wrong type. "
                        f"Expected {expected_type}, got {type(value).__name__}"
                    )

        return errors

    def _check_type(self, value: Any, expected_type: str) -> bool:
        """Check whether a value matches the expected JSON schema type."""
        type_map: dict[str, type] = {
            "string": str,
            "number": (int, float),
            "integer": int,
            "boolean": bool,
            "array": list,
            "object": dict,
            "null": type(None),
        }
        expected_python_type = type_map.get(expected_type)
        if expected_python_type is None:
            return True
        return isinstance(value, expected_python_type)

    def to_schema_dict(self) -> dict[str, Any]:
        """Return the OpenAI function-calling schema for this tool."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }


# ---------------------------------------------------------------------------
# Backward-compat: legacy dict-style result for existing tools
# ---------------------------------------------------------------------------

def dict_to_result(result: Any) -> ToolResult:
    """Convert a legacy dict/list result to ToolResult.

    Handles:
        - ToolResult instance -> pass through
        - (content_str, error_str_or_None) tuple
        - dict with 'success' key
        - bare str / list -> wrapped as content
        - bare Exception -> wrapped as error
    """
    if isinstance(result, ToolResult):
        return result

    if isinstance(result, tuple) and len(result) == 2:
        content, err = result
        if err:
            return ToolResult.err(str(err))
        return ToolResult.ok(str(content) if content else "")

    if isinstance(result, dict):
        if result.get("success") is False:
            return ToolResult.err(result.get("error") or "Unknown error", result)
        return ToolResult.ok(
            result.get("content") or result.get("output") or json.dumps(result),
            result,
        )

    if isinstance(result, Exception):
        return ToolResult.err(str(result))

    return ToolResult.ok(str(result) if result is not None else "")
