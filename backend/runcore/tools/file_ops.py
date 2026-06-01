"""
Unified file operations tool — read, write, list, delete, move, glob.

Inspired by codewiz-agent's file_ops tool design.
Each operation is a sub-command of a single tool for reduced token overhead.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any, Optional

from runcore.tools.base import Tool, ToolResult, _safe_resolve, CODE_EXTENSIONS, SKIP_DIRS
from runcore.security import check_extension

log = logging.getLogger(__name__)


class FileOpsTool(Tool):
    """Unified file operations tool.

    Supports 8 operations as sub-commands:
      - read_file, write_file, list_dir, create_dir,
        delete_file, move_file, glob_search, get_file_info

    Workspace boundary enforcement and .gitignore support are included.
    """

    @property
    def name(self) -> str:
        return "file_ops"

    @property
    def description(self) -> str:
        return (
            "Unified file operations tool. Perform safe file system access "
            "restricted to the workspace directory. Operations include reading, "
            "writing, listing, creating, deleting, moving files and directories, "
            "glob searching, and getting file metadata. "
            "All paths are validated to stay within the workspace boundary."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": [
                        "read_file", "write_file", "list_dir",
                        "create_dir", "delete_file", "move_file",
                        "glob_search", "get_file_info",
                    ],
                    "description": "The file operation to perform",
                },
                "path": {
                    "type": "string",
                    "description": (
                        "Path to the file or directory (relative to user dir "
                        "or absolute; absolute paths are rebased under user sandbox)"
                    ),
                },
                "content": {
                    "type": "string",
                    "description": "File content for write operations",
                },
                "append": {
                    "type": "boolean",
                    "description": "Append instead of overwrite for write_file",
                    "default": False,
                },
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern for glob_search (e.g. '*.py', 'src/**/*.ts')",
                },
                "recursive": {
                    "type": "boolean",
                    "description": "Search/list recursively",
                    "default": True,
                },
                "max_lines": {
                    "type": "integer",
                    "description": "Maximum lines to read (default 500)",
                    "default": 500,
                },
                "start_line": {
                    "type": "integer",
                    "description": "Starting line number (1-indexed, default 1)",
                    "default": 1,
                },
                "include_line_numbers": {
                    "type": "boolean",
                    "description": "Include line numbers in output",
                    "default": True,
                },
                "destination": {
                    "type": "string",
                    "description": "Destination path for move operations",
                },
            },
            "required": ["operation", "path"],
        }

    def execute(self, input_data: dict[str, Any], username: str) -> ToolResult:
        operation = input_data.get("operation", "")
        path = input_data.get("path", "")

        try:
            if operation == "read_file":
                return self._read_file(input_data, username)
            elif operation == "write_file":
                return self._write_file(input_data, username)
            elif operation == "list_dir":
                return self._list_dir(input_data, username)
            elif operation == "create_dir":
                return self._create_dir(input_data, username)
            elif operation == "delete_file":
                return self._delete_file(input_data, username)
            elif operation == "move_file":
                return self._move_file(input_data, username)
            elif operation == "glob_search":
                return self._glob_search(input_data, username)
            elif operation == "get_file_info":
                return self._get_file_info(input_data, username)
            else:
                return ToolResult.err(f"Unknown operation: {operation}")
        except PermissionError as e:
            return ToolResult.err(f"Access denied: {e}")
        except FileNotFoundError as e:
            return ToolResult.err(f"File not found: {e}")
        except Exception as e:
            log.exception(f"file_ops.{operation} failed")
            return ToolResult.err(f"Operation failed: {e}")

    def _resolve_path(self, path: str, username: str) -> Path:
        """Resolve a path within the user's sandbox."""
        return _safe_resolve(path, username)

    def _read_file(self, input_data: dict[str, Any], username: str) -> ToolResult:
        path_str = input_data.get("path", "")
        max_lines = input_data.get("max_lines", 500)
        start_line = input_data.get("start_line", 1)
        include_line_numbers = input_data.get("include_line_numbers", True)

        if not check_extension(path_str, "read"):
            return ToolResult.err(f"File extension not allowed for read: {path_str}")

        full = self._resolve_path(path_str, username)

        if not full.exists():
            return ToolResult.err(f"File not found: {full}")
        if not full.is_file():
            return ToolResult.err(f"Not a file: {full}")

        try:
            with open(full, encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()

            total_lines = len(all_lines)
            start_idx = max(0, start_line - 1)
            end_idx = min(total_lines, start_idx + max_lines)
            snippet = all_lines[start_idx:end_idx]

            if include_line_numbers:
                lines_out = []
                for i, line in enumerate(snippet, start=start_line):
                    lines_out.append(f"{i:6d} | {line.rstrip()}")
                content = "\n".join(lines_out)
            else:
                content = "".join(snippet)

            truncated = end_idx < total_lines

            return ToolResult.ok(content, metadata={
                "path": str(full),
                "total_lines": total_lines,
                "read_lines": len(snippet),
                "start_line": start_line,
                "truncated": truncated,
            })
        except Exception as e:
            return ToolResult.err(f"Failed to read: {e}")

    def _write_file(self, input_data: dict[str, Any], username: str) -> ToolResult:
        path_str = input_data.get("path", "")
        content = input_data.get("content", "")
        append = input_data.get("append", False)

        if not check_extension(path_str, "write"):
            return ToolResult.err(f"File extension not allowed for write: {path_str}")

        full = self._resolve_path(path_str, username)
        os.makedirs(full.parent, exist_ok=True)
        mode = "a" if append else "w"

        try:
            with open(full, mode, encoding="utf-8") as f:
                f.write(content)
            return ToolResult.ok(
                f"Wrote {len(content)} bytes to {full}",
                metadata={"path": str(full), "bytes": len(content), "appended": append},
            )
        except Exception as e:
            return ToolResult.err(f"Failed to write: {e}")

    def _list_dir(self, input_data: dict[str, Any], username: str) -> ToolResult:
        path_str = input_data.get("path", ".")
        recursive = input_data.get("recursive", False)

        full = self._resolve_path(path_str, username)

        if not full.exists():
            return ToolResult.err(f"Directory not found: {full}")
        if not full.is_dir():
            return ToolResult.err(f"Not a directory: {full}")

        try:
            entries = []
            if recursive:
                for root, dirs, files in os.walk(full):
                    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                    for name in sorted(files):
                        rel = os.path.relpath(os.path.join(root, name), full)
                        entries.append(f"FILE {rel}")
                    for name in sorted(dirs):
                        rel = os.path.relpath(os.path.join(root, name), full)
                        entries.append(f"DIR  {rel}/")
            else:
                for name in sorted(os.listdir(full)):
                    full_path = full / name
                    tag = "DIR  " if full_path.is_dir() else "FILE "
                    entries.append(f"{tag}{name}")

            content = "\n".join(entries[:500])
            return ToolResult.ok(
                f"Contents of {full} ({len(entries)} entries):\n{content}",
                metadata={"path": str(full), "count": len(entries), "recursive": recursive},
            )
        except Exception as e:
            return ToolResult.err(f"Failed to list directory: {e}")

    def _create_dir(self, input_data: dict[str, Any], username: str) -> ToolResult:
        path_str = input_data.get("path", "")
        full = self._resolve_path(path_str, username)
        try:
            os.makedirs(full, exist_ok=True)
            return ToolResult.ok(f"Created directory: {full}", metadata={"path": str(full)})
        except Exception as e:
            return ToolResult.err(f"Failed to create directory: {e}")

    def _delete_file(self, input_data: dict[str, Any], username: str) -> ToolResult:
        path_str = input_data.get("path", "")
        full = self._resolve_path(path_str, username)
        if not full.exists():
            return ToolResult.err(f"Path does not exist: {full}")
        try:
            if full.is_dir():
                shutil.rmtree(full)
            else:
                full.unlink()
            return ToolResult.ok(f"Deleted: {full}", metadata={"path": str(full)})
        except Exception as e:
            return ToolResult.err(f"Failed to delete: {e}")

    def _move_file(self, input_data: dict[str, Any], username: str) -> ToolResult:
        path_str = input_data.get("path", "")
        dest_str = input_data.get("destination", "")
        if not dest_str:
            return ToolResult.err("destination is required for move_file")
        src = self._resolve_path(path_str, username)
        dest = self._resolve_path(dest_str, username)
        if not src.exists():
            return ToolResult.err(f"Source does not exist: {src}")
        try:
            os.makedirs(dest.parent, exist_ok=True)
            shutil.move(str(src), str(dest))
            return ToolResult.ok(
                f"Moved {src} -> {dest}",
                metadata={"source": str(src), "destination": str(dest)},
            )
        except Exception as e:
            return ToolResult.err(f"Failed to move: {e}")

    def _glob_search(self, input_data: dict[str, Any], username: str) -> ToolResult:
        pattern = input_data.get("pattern", "*")
        recursive = input_data.get("recursive", True)
        base = input_data.get("path", ".")

        full = self._resolve_path(base, username)
        try:
            if recursive:
                matches = list(full.glob(f"**/{pattern}"))
            else:
                matches = list(full.glob(pattern))
            matches = [m for m in matches if m.is_file()][:100]
            rel_paths = [str(m.relative_to(full)) for m in matches]
            content = "\n".join(f"  - {p}" for p in rel_paths)
            if len(rel_paths) == 100:
                content += f"\n  ... (truncated at 100)"
            return ToolResult.ok(
                f"Found {len(rel_paths)} files matching '{pattern}':\n{content}",
                metadata={"pattern": pattern, "count": len(rel_paths), "recursive": recursive},
            )
        except Exception as e:
            return ToolResult.err(f"Glob search failed: {e}")

    def _get_file_info(self, input_data: dict[str, Any], username: str) -> ToolResult:
        path_str = input_data.get("path", "")
        full = self._resolve_path(path_str, username)
        if not full.exists():
            return ToolResult.err(f"Path does not exist: {full}")
        try:
            stat = full.stat()
            info = {
                "path": str(full),
                "type": "directory" if full.is_dir() else "file",
                "size": stat.st_size,
                "modified": stat.st_mtime,
            }
            content = "\n".join(f"  {k}: {v}" for k, v in info.items())
            return ToolResult.ok(f"File info for {full}:\n{content}", metadata=info)
        except Exception as e:
            return ToolResult.err(f"Failed to get file info: {e}")
