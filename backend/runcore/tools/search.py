"""
Unified code search tool — grep, content search, symbol search.

Inspired by codewiz-agent's search tool design.
Three search modes in one tool for reduced token overhead.
"""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

from runcore.tools.base import Tool, ToolResult, _safe_resolve, CODE_EXTENSIONS, SKIP_DIRS

log = logging.getLogger(__name__)


class SearchTool(Tool):
    """Unified code search tool.

    Three search modes:
      - grep: Regex pattern search in files
      - search_file: Simple text search in file contents
      - search_symbol: Find function/class/interface definitions

    Respects .gitignore rules.
    """


    @property
    def name(self) -> str:
        return "search"

    @property
    def description(self) -> str:
        return (
            "Search for code patterns, text, and symbols in the workspace. "
            "Three modes: grep (regex search), search_file (text search), "
            "search_symbol (find function/class definitions). "
            "Supports file type filtering and respects .gitignore rules."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["grep", "search_file", "search_symbol"],
                    "description": "The search operation to perform",
                },
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern (grep) or search text (search_file/search_symbol)",
                },
                "path": {
                    "type": "string",
                    "description": "Directory path to search in (defaults to user root)",
                    "default": ".",
                },
                "file_pattern": {
                    "type": "string",
                    "description": "File glob pattern (e.g. '*.py', '*.js')",
                },
                "case_sensitive": {
                    "type": "boolean",
                    "description": "Case sensitive search",
                    "default": False,
                },
                "context": {
                    "type": "integer",
                    "description": "Context lines before/after match",
                    "default": 2,
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum results to return",
                    "default": 50,
                },
            },
            "required": ["operation", "pattern"],
        }

    def execute(self, input_data: dict[str, Any], username: str) -> ToolResult:
        operation = input_data.get("operation", "")
        pattern = input_data.get("pattern", "")

        try:
            if operation == "grep":
                return self._grep(input_data, username)
            elif operation == "search_file":
                return self._search_file(input_data, username)
            elif operation == "search_symbol":
                return self._search_symbol(input_data, username)
            else:
                return ToolResult.err(f"Unknown operation: {operation}")
        except Exception as e:
            log.exception(f"search.{operation} failed")
            return ToolResult.err(f"Search failed: {e}")

    def _resolve_path(self, path_str: str, username: str) -> Path:
        return _safe_resolve(path_str, username)

    def _get_files_to_search(
        self, root: Path, file_pattern: str | None, recursive: bool
    ) -> list[Path]:
        """Get list of files matching the pattern under root."""
        files: list[Path] = []

        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

            if not recursive:
                for fname in filenames:
                    ext = os.path.splitext(fname)[1].lower()
                    if not file_pattern or self._matches_glob(fname, file_pattern):
                        if ext in CODE_EXTENSIONS or not ext:
                            files.append(Path(dirpath) / fname)
                continue

            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if not file_pattern or self._matches_glob(fname, file_pattern):
                    if ext in CODE_EXTENSIONS or not ext:
                        files.append(Path(dirpath) / fname)

        return files

    def _matches_glob(self, fname: str, pattern: str) -> bool:
        """Simple glob matching (supports * and ?)."""
        import fnmatch
        return fnmatch.fnmatch(fname, pattern)

    def _grep(self, input_data: dict[str, Any], username: str) -> ToolResult:
        pattern = input_data.get("pattern", "")
        path_str = input_data.get("path", ".")
        file_pattern = input_data.get("file_pattern")
        context = input_data.get("context", 2)
        case_sensitive = input_data.get("case_sensitive", False)
        max_results = input_data.get("max_results", 50)

        try:
            flags = 0 if case_sensitive else re.IGNORECASE
            regex = re.compile(pattern, flags)
        except re.error as e:
            return ToolResult.err(f"Invalid regex pattern: {e}")

        root = self._resolve_path(path_str, username)
        files = self._get_files_to_search(root, file_pattern, recursive=True)
        if not files:
            return ToolResult.ok("No files found to search", metadata={"matches": []})

        matches: list[dict[str, Any]] = []
        total = 0

        for fpath in files:
            try:
                with open(fpath, encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()

                file_matches = []
                for lineno, line in enumerate(lines, 1):
                    if regex.search(line):
                        file_matches.append((lineno, line.rstrip()))
                        total += 1

                if file_matches:
                    for lineno, line_content in file_matches[:10]:
                        if len(matches) >= max_results:
                            break
                        start_idx = max(0, lineno - context - 1)
                        end_idx = min(len(lines), lineno + context)
                        ctx_lines = []
                        for i in range(start_idx, end_idx):
                            prefix = ">>>" if i == lineno - 1 else "   "
                            ctx_lines.append(f"{prefix}{i + 1:5d} | {lines[i].rstrip()}")
                        rel = fpath.relative_to(root)
                        matches.append({
                            "file": str(rel).replace("\\", "/"),
                            "line": lineno,
                            "content": line_content,
                            "context": ctx_lines,
                        })
            except Exception:
                continue

        if not matches:
            return ToolResult.ok(
                f"No matches found for: {pattern}",
                metadata={"matches": [], "total": 0},
            )

        output_lines = [f"Found {total} matches (showing {len(matches)}):\n"]
        current_file = None
        for m in matches:
            if m["file"] != current_file:
                current_file = m["file"]
                output_lines.append(f"\n{'=' * 70}\nFile: {current_file}\n{'=' * 70}")
            output_lines.append(f"\nLine {m['line']}: {m['content']}")
            for ctx in m["context"]:
                output_lines.append(ctx)

        return ToolResult.ok(
            "\n".join(output_lines),
            metadata={
                "matches": matches,
                "total_matches": total,
                "files_with_matches": len(set(m["file"] for m in matches)),
            },
        )

    def _search_file(self, input_data: dict[str, Any], username: str) -> ToolResult:
        pattern = input_data.get("pattern", "")
        path_str = input_data.get("path", ".")
        file_pattern = input_data.get("file_pattern")
        case_sensitive = input_data.get("case_sensitive", False)
        max_results = input_data.get("max_results", 50)

        if case_sensitive:
            search_fn = lambda text: pattern in text
        else:
            pattern_lower = pattern.lower()
            search_fn = lambda text: pattern_lower in text.lower()

        root = self._resolve_path(path_str, username)
        files = self._get_files_to_search(root, file_pattern, recursive=True)
        if not files:
            return ToolResult.ok("No files found to search", metadata={"matches": []})

        matches: list[dict[str, Any]] = []
        total = 0

        for fpath in files:
            try:
                with open(fpath, encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()

                file_matches = []
                for lineno, line in enumerate(lines, 1):
                    if search_fn(line):
                        file_matches.append((lineno, line.rstrip()))
                        total += 1

                if file_matches:
                    for lineno, line_content in file_matches[:5]:
                        if len(matches) >= max_results:
                            break
                        rel = fpath.relative_to(root)
                        matches.append({
                            "file": str(rel).replace("\\", "/"),
                            "line": lineno,
                            "content": line_content,
                        })
            except Exception:
                continue

        if not matches:
            return ToolResult.ok(f"No matches found for: {pattern}", metadata={"matches": []})

        output_lines = [f"Found {total} matches (showing {len(matches)}):\n"]
        current_file = None
        for m in matches:
            if m["file"] != current_file:
                current_file = m["file"]
                output_lines.append(f"\n--- {current_file} ---")
            output_lines.append(f"  {m['line']:5d}: {m['content']}")

        return ToolResult.ok(
            "\n".join(output_lines),
            metadata={"matches": matches, "total": total},
        )

    def _search_symbol(self, input_data: dict[str, Any], username: str) -> ToolResult:
        pattern = input_data.get("pattern", "")
        path_str = input_data.get("path", ".")
        case_sensitive = input_data.get("case_sensitive", False)
        max_results = input_data.get("max_results", 50)

        symbol_patterns = {
            ".py": [
                (r"^def\s+(\w+)", "function"),
                (r"^async\s+def\s+(\w+)", "async function"),
                (r"^class\s+(\w+)", "class"),
            ],
            ".js": [
                (r"function\s+(\w+)", "function"),
                (r"const\s+(\w+)\s*=", "const"),
                (r"let\s+(\w+)\s*=", "let"),
                (r"class\s+(\w+)", "class"),
            ],
            ".ts": [
                (r"function\s+(\w+)", "function"),
                (r"const\s+(\w+)\s*:", "const"),
                (r"class\s+(\w+)", "class"),
                (r"interface\s+(\w+)", "interface"),
                (r"type\s+(\w+)\s*=", "type"),
            ],
            ".tsx": [
                (r"function\s+(\w+)", "function"),
                (r"class\s+(\w+)", "class"),
                (r"interface\s+(\w+)", "interface"),
            ],
            ".go": [
                (r"func\s+(\w+)", "function"),
                (r"func\s+\([\w\s]+\*?(\w+)\)\s+(\w+)", "method"),
                (r"type\s+(\w+)\s+struct", "struct"),
                (r"type\s+(\w+)\s+interface", "interface"),
            ],
            ".rs": [
                (r"fn\s+(\w+)", "function"),
                (r"struct\s+(\w+)", "struct"),
                (r"impl\s+(\w+)", "impl"),
                (r"trait\s+(\w+)", "trait"),
                (r"enum\s+(\w+)", "enum"),
            ],
        }

        root = self._resolve_path(path_str, username)
        files = self._get_files_to_search(root, None, recursive=True)
        if not files:
            return ToolResult.ok("No files found", metadata={"symbols": []})

        matches: list[dict[str, Any]] = []

        for fpath in files:
            ext = fpath.suffix.lower()
            patterns_to_use = symbol_patterns.get(ext, symbol_patterns.get(".js", []))
            if not patterns_to_use:
                continue

            try:
                with open(fpath, encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()

                for lineno, line in enumerate(lines, 1):
                    for regex_pat, sym_type in patterns_to_use:
                        flags = 0 if case_sensitive else re.IGNORECASE
                        try:
                            m = re.search(regex_pat, line, flags)
                            if m and (not case_sensitive and pattern.lower() in m.group(1).lower() or
                                      case_sensitive and pattern in m.group(1)):
                                rel = fpath.relative_to(root)
                                matches.append({
                                    "file": str(rel).replace("\\", "/"),
                                    "line": lineno,
                                    "name": m.group(1),
                                    "type": sym_type,
                                    "content": line.strip(),
                                })
                        except re.error:
                            continue
            except Exception:
                continue

        matches.sort(key=lambda x: (x["file"], x["line"]))
        matches = matches[:max_results]

        if not matches:
            return ToolResult.ok(
                f"No symbols found matching: {pattern}",
                metadata={"symbols": [], "total": 0},
            )

        output_lines = [f"Found {len(matches)} symbols:\n"]
        current_file = None
        for m in matches:
            if m["file"] != current_file:
                current_file = m["file"]
                output_lines.append(f"\n--- {current_file} ---")
            output_lines.append(f"  {m['line']:5d} [{m['type']:15s}] {m['name']}")

        return ToolResult.ok(
            "\n".join(output_lines),
            metadata={"symbols": matches, "total": len(matches)},
        )
