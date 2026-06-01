"""
Codemap scan tool — fast code structure indexing for module location.
"""
from __future__ import annotations

import logging
from typing import Any

from runcore.tools.base import Tool, ToolResult
from runcore.codemap.scanner import scan_directory

log = logging.getLogger(__name__)


class ScanRepoTool(Tool):
    """Quickly scan a repository's code structure to locate relevant modules."""

    name = "scan_repo"
    description = (
        "Scan a repository's code structure and return a structured file map. "
        "Use this FIRST when starting a new task — it gives you the full project "
        "layout so you know where to read/write files. Much faster than list_dir + grep chains."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "repo_path": {
                "type": "string",
                "description": "Absolute path to the repository root",
            },
            "query": {
                "type": "string",
                "description": "Optional: keywords to filter relevant files (e.g. 'article preview component')",
            },
            "max_files": {
                "type": "integer",
                "description": "Max number of files to scan (default 2000)",
                "default": 2000,
            },
        },
        "required": ["repo_path"],
    }

    def execute(self, args: dict[str, Any], username: str) -> ToolResult:
        repo_path = args.get("repo_path", "")
        query = args.get("query", "")
        max_files = args.get("max_files", 2000)

        if not repo_path:
            return ToolResult.err("repo_path is required")

        try:
            scan = scan_directory(repo_path, max_files=max_files)
        except Exception as e:
            return ToolResult.err(f"Scan failed: {e}")

        files = scan.get("files", [])
        keywords = [k.strip().lower() for k in query.split() if k.strip()] if query else []

        if keywords:
            scored = []
            for f in files:
                path_lower = f["path"].lower()
                score = sum(1 for kw in keywords if kw in path_lower)
                if score > 0:
                    scored.append((score, f))
            scored.sort(key=lambda x: x[0], reverse=True)
            files = [f for _, f in scored[:20]]
            result_files = files
        else:
            result_files = files[:50]

        dirs = sorted(set(
            "/".join(f["path"].split("/")[:-1])
            for f in result_files if "/" in f["path"]
        ))[:30]

        return ToolResult.ok({
            "success": True,
            "total_files": len(scan.get("files", [])),
            "truncated": scan.get("truncated", False),
            "top_directories": dirs,
            "top_files": result_files,
            "note": "Use this output to locate where to read/write files. "
                    "Next step: read_file on the most relevant files."
        })


# Module-level singleton for backward compatibility
_tool_instance: ScanRepoTool | None = None


def get_scan_repo_tool() -> ScanRepoTool:
    global _tool_instance
    if _tool_instance is None:
        _tool_instance = ScanRepoTool()
    return _tool_instance
