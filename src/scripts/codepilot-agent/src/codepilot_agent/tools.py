"""Tool definitions for the Python agent loop.

Mirrors src/lib/tools/ from the TypeScript codebase.
Each tool is a callable that returns a dict conforming to the Anthropic tool-use schema.

Tool execution model:
  - Each tool is a function (tool_call_id, tool_input) -> str result
  - Tools raise ToolError for structured errors
  - The agent loop catches all tool results and streams them as SSE
"""

from __future__ import annotations

import fnmatch
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

# Maximum file read size (10MB, matching TypeScript)
MAX_FILE_SIZE = 10 * 1024 * 1024
# Maximum bash output (1MB, matching TypeScript)
MAX_BASH_OUTPUT = 1024 * 1024
# Default bash timeout (2 minutes)
DEFAULT_BASH_TIMEOUT_MS = 120_000


class ToolError(Exception):
    """Raised by a tool to indicate a structured failure."""

    def __init__(self, message: str, is_error: bool = True) -> None:
        super().__init__(message)
        self.is_error = is_error


@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]  # JSON schema
    execute: Callable[..., str]


# ── Tool Implementations ────────────────────────────────────────────────────────


def _read_file(file_path: str, offset: int | None = None, limit: int | None = None) -> str:
    """Read a file and return numbered lines."""
    resolved = Path(file_path)
    if not resolved.exists():
        raise ToolError(f"Error: File not found: {resolved}")

    if resolved.is_dir():
        raise ToolError(
            f"Error: {resolved} is a directory, not a file. "
            "Use Glob or Bash to list directory contents."
        )

    stat = resolved.stat()
    if stat.st_size > MAX_FILE_SIZE:
        raise ToolError(
            f"Error: File is too large "
            f"({stat.st_size / 1024 / 1024:.1f}MB). "
            "Use offset and limit to read portions."
        )

    content = resolved.read_text(encoding="utf-8")
    lines = content.split("\n")

    start_line = offset if offset is not None else 0
    max_lines = limit if limit is not None else 2000
    end_line = min(start_line + max_lines, len(lines))
    slice_lines = lines[start_line:end_line]

    numbered = "\n".join(f"{start_line + i + 1}\t{line}" for i, line in enumerate(slice_lines))

    header = ""
    if end_line < len(lines):
        header = f"[Showing lines {start_line + 1}-{end_line} of {len(lines)}]\n"

    return header + numbered


def _write_file(file_path: str, content: str) -> str:
    """Write content to a file, creating parent directories as needed."""
    resolved = Path(file_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(content, encoding="utf-8")
    line_count = len(content.split("\n"))
    return f"Successfully wrote {line_count} lines to {resolved}"


def _edit_file(file_path: str, old_string: str, new_string: str) -> str:
    """Replace old_string with new_string in a file."""
    resolved = Path(file_path)
    if not resolved.exists():
        raise ToolError(f"Error: File not found: {resolved}")

    original = resolved.read_text(encoding="utf-8")

    if old_string not in original:
        raise ToolError(
            f"Error: The string to replace was not found in {file_path}. "
            "Make sure the indentation and content match exactly."
        )

    # Count occurrences to detect ambiguity
    count = original.count(old_string)
    if count > 1:
        raise ToolError(
            f"Error: The replacement string appears {count} times in the file. "
            "Make old_string more specific (include more surrounding context)."
        )

    new_content = original.replace(old_string, new_string, 1)
    resolved.write_text(new_content, encoding="utf-8")

    return f"Successfully edited {file_path}"


def _glob(pattern: str, cwd: str) -> str:
    """Return files matching a glob pattern (relative to cwd)."""
    base = Path(cwd)
    # Convert **/*.py style patterns to pathlib patterns
    results: list[str] = []
    for path in base.rglob(pattern.lstrip("**/")):
        if path.is_file():
            rel = path.relative_to(base).as_posix()
            results.append(rel)

    if not results:
        return "No files found."

    return "\n".join(sorted(results))


def _grep(
    pattern: str,
    cwd: str,
    glob: str | None = None,
    case_sensitive: bool = False,
    context: int = 0,
) -> str:
    """Search for pattern in files, like grep."""
    flags = 0 if case_sensitive else re.IGNORECASE
    regex = re.compile(pattern, flags)

    base = Path(cwd)
    results: list[str] = []
    file_count = 0
    match_count = 0

    for file_path in base.rglob(glob or "*"):
        if not file_path.is_file():
            continue
        # Skip binary files and large files
        try:
            if file_path.stat().st_size > MAX_FILE_SIZE:
                continue
            text = file_path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        file_count += 1
        for line_no, line in enumerate(text.split("\n"), 1):
            if regex.search(line):
                match_count += 1
                if context > 0:
                    # Simple context: show surrounding lines
                    start = max(0, line_no - context - 1)
                    end = min(len(text.split("\n")), line_no + context)
                    snippet_lines = text.split("\n")[start:end]
                    for i, sl in enumerate(snippet_lines):
                        lineno = start + i + 1
                        marker = ">>>" if start + i + 1 == line_no else "   "
                        results.append(f"{marker} {file_path.relative_to(base).as_posix()}:{lineno}:{sl}")
                else:
                    results.append(f"{file_path.relative_to(base).as_posix()}:{line_no}:{line}")

        if match_count > 200:
            results.append(f"(stopped after 200 matches across {file_count} files)")
            break

    if not results:
        return f"No matches found for '{pattern}'."

    return "\n".join(results)


def _bash(command: str, cwd: str, timeout: int | None = None, abort_signal: Any = None) -> str:
    """Execute a shell command and return stdout+stderr."""
    timeout_ms = timeout if timeout is not None else DEFAULT_BASH_TIMEOUT_MS

    # Determine shell command
    if sys.platform == "win32":
        shell_cmd = ["powershell", "-NoProfile", "-Command", command]
    else:
        shell_cmd = ["bash", "-c", command]

    env = dict(os.environ)
    env["TERM"] = "dumb"

    chunks: list[bytes] = []
    total_bytes = 0
    result_lock = threading.Lock()
    timed_out = False

    try:
        proc = subprocess.Popen(
            shell_cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
        )
    except OSError as e:
        raise ToolError(f"Error executing command: {e}")

    if proc.stdout is None:
        raise ToolError("Error: subprocess stdout is None")

    def _reader():
        nonlocal total_bytes
        try:
            while True:
                if abort_signal is not None and abort_signal.is_set():
                    try:
                        proc.kill()
                    except OSError:
                        pass
                    return
                data = os.read(proc.stdout.fileno(), 8192)
                if not data:
                    return
                with result_lock:
                    total_bytes += len(data)
                    if total_bytes > MAX_BASH_OUTPUT:
                        remaining = MAX_BASH_OUTPUT - (total_bytes - len(data))
                        if remaining > 0:
                            chunks.append(data[:remaining])
                        chunks.append(b"\n\n[Output truncated -- exceeded 1MB limit]")
                        try:
                            proc.kill()
                        except OSError:
                            pass
                        return
                    chunks.append(data)
        except OSError:
            pass

    reader_thread = threading.Thread(target=_reader, daemon=True)
    reader_thread.start()

    # Wait for completion with timeout
    start = time.monotonic()
    while True:
        if abort_signal is not None and abort_signal.is_set():
            proc.kill()
            timed_out = True
            break
        exit_code = proc.poll()
        if exit_code is not None:
            break
        if (time.monotonic() - start) * 1000 > timeout_ms:
            proc.kill()
            timed_out = True
            break
        time.sleep(0.05)

    reader_thread.join(timeout=5)

    output = b"".join(chunks).decode("utf-8", errors="replace")

    if timed_out:
        output += f"\n\n[Process killed: timeout after {timeout_ms}ms]\nCommand: {command[:200]}"

    if not timed_out and proc.returncode is not None and proc.returncode != 0:
        output += f"\n\n[Exit code: {proc.returncode}]"

    return output or "(no output)"


# ── Tool Registry ───────────────────────────────────────────────────────────────

TOOLS: dict[str, ToolDefinition] = {
    "Read": ToolDefinition(
        name="Read",
        description=(
            "Read the contents of a file. Output includes line numbers "
            "(line_number\\tcontent). Use offset and limit to read specific ranges."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Absolute path to the file to read"},
                "offset": {"type": "integer", "minimum": 0, "description": "Line number to start reading from (0-based)"},
                "limit": {"type": "integer", "minimum": 1, "description": "Maximum number of lines to read"},
            },
            "required": ["file_path"],
        },
        execute=lambda ctx, tool_input: _read_file(
            tool_input["file_path"],
            tool_input.get("offset"),
            tool_input.get("limit"),
        ),
    ),
    "Write": ToolDefinition(
        name="Write",
        description=(
            "Write content to a file. Creates the file and any parent directories "
            "if they don't exist. Overwrites the file if it already exists. "
            "Use Edit for modifying existing files."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Absolute path to the file to write"},
                "content": {"type": "string", "description": "The full content to write to the file"},
            },
            "required": ["file_path", "content"],
        },
        execute=lambda ctx, tool_input: _write_file(
            tool_input["file_path"],
            tool_input["content"],
        ),
    ),
    "Edit": ToolDefinition(
        name="Edit",
        description=(
            "Make a precise edit to a file. Replaces the first occurrence of old_string "
            "with new_string. Use Write to overwrite entire files. "
            "Make sure old_string matches exactly (including indentation)."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Absolute path to the file to edit"},
                "old_string": {"type": "string", "description": "The exact text to find and replace"},
                "new_string": {"type": "string", "description": "The replacement text"},
            },
            "required": ["file_path", "old_string", "new_string"],
        },
        execute=lambda ctx, tool_input: _edit_file(
            tool_input["file_path"],
            tool_input["old_string"],
            tool_input["new_string"],
        ),
    ),
    "Bash": ToolDefinition(
        name="Bash",
        description=(
            "Execute a bash command and return its output (stdout + stderr combined). "
            "The command runs in the working directory. "
            "Long-running commands are automatically killed after the timeout."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The bash command to execute"},
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in milliseconds (default 120000)",
                },
            },
            "required": ["command"],
        },
        execute=lambda ctx, tool_input: _bash(
            tool_input["command"],
            ctx.get("working_directory", os.getcwd()),
            tool_input.get("timeout"),
            ctx.get("abort_signal"),
        ),
    ),
    "Glob": ToolDefinition(
        name="Glob",
        description=(
            "Return files matching a glob pattern relative to the working directory. "
            "Supports ** for recursive matching (e.g., **/*.py matches all Python files)."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob pattern to match files"},
            },
            "required": ["pattern"],
        },
        execute=lambda ctx, tool_input: _glob(
            tool_input["pattern"],
            ctx.get("working_directory", os.getcwd()),
        ),
    ),
    "Grep": ToolDefinition(
        name="Grep",
        description=(
            "Search for a text pattern in files. Returns matching lines with file paths "
            "and line numbers. Supports regex patterns. "
            "Use glob to restrict to specific file types (e.g., *.py)."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Regex pattern to search for"},
                "glob": {"type": "string", "description": "Only search in files matching this glob (e.g., *.py)"},
                "case_sensitive": {"type": "boolean", "description": "Case sensitive search (default: false)"},
                "context": {"type": "integer", "description": "Number of context lines around matches"},
            },
            "required": ["pattern"],
        },
        execute=lambda ctx, tool_input: _grep(
            tool_input["pattern"],
            ctx.get("working_directory", os.getcwd()),
            tool_input.get("glob"),
            tool_input.get("case_sensitive", False),
            tool_input.get("context", 0),
        ),
    ),
}


def get_tool(name: str) -> ToolDefinition | None:
    return TOOLS.get(name)


def get_tool_names() -> list[str]:
    return list(TOOLS.keys())


def get_tool_schemas() -> list[dict[str, Any]]:
    """Return all tool schemas for API injection."""
    return [
        {
            "name": t.name,
            "description": t.description,
            "input_schema": t.input_schema,
        }
        for t in TOOLS.values()
    ]
