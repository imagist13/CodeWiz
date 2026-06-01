from __future__ import annotations

"""tools module — unified tool system."""

from runcore.tools.base import Tool, ToolResult, dict_to_result
from runcore.tools.registry import get_registry, register_legacy_tool, AsyncToolRegistry
from runcore.tools.file_ops import FileOpsTool
from runcore.tools.search import SearchTool
# Legacy tool functions — DEPRECATED, kept for backward-compat imports only.
# Use the new unified tools (file_ops, search) instead.
from runcore.tools import legacy_tools as _lt
bash_tool = _lt.bash_tool
read_file_tool = _lt.read_file_tool
write_file_tool = _lt.write_file_tool
list_dir_tool = _lt.list_dir_tool
delete_file_tool = _lt.delete_file_tool
search_files_tool = _lt.search_files_tool
register_all_legacy_tools = _lt.register_all_legacy_tools
