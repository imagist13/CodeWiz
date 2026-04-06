"""
Harness Tool System
Based on learn-claude-code session patterns
"""
import re
import json
import uuid
import os
import threading
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum

# ---------------------------------------------------------------------------
# Context: 每个 chat 请求携带 repo_id，工具们通过这个 thread-local 变量
# 知道当前操作的是哪个项目的沙箱目录。
# ---------------------------------------------------------------------------
_context = threading.local()


def set_current_context(repo_id: Optional[str], token: Optional[str] = None) -> None:
    _context.repo_id = repo_id
    _context.token = token


def get_current_repo_id() -> Optional[str]:
    return getattr(_context, "repo_id", None)


def get_current_token() -> Optional[str]:
    return getattr(_context, "token", None)


def _sandbox_root() -> str:
    """
    必须与 sandbox_manager.SANDBOX_ROOT 完全一致。
    此前 tools 默认用 /tmp/adorable-sandbox，而 Windows 上 manager 用 %TEMP%，
    导致文件写在一处、http.server 在另一处 → 预览「Directory listing for /」为空。
    """
    from app.harness.sandbox_manager import SANDBOX_ROOT

    return SANDBOX_ROOT


def _preview_host() -> str:
    """
    返回预览服务器的宿主机地址。
    - 如果在 Docker 里运行（检测到 DOCKER_* 环境变量），用 host.docker.internal
    - 否则用 localhost
    这样浏览器可以直接访问预览服务器。
    """
    if os.environ.get("DOCKER_CONTAINER"):
        return "host.docker.internal"
    # 其他容器化场景检测
    if os.path.exists("/.dockerenv"):
        return "host.docker.internal"
    return "localhost"


def _project_dir() -> str:
    """
    返回当前项目的代码目录。
    如果有 repo_id → /tmp/adorable-sandbox/<repo_id>/
    否则 → 当前工作目录（向后兼容）
    """
    repo_id = get_current_repo_id()
    if repo_id:
        root = _sandbox_root()
        d = os.path.join(root, repo_id)
        os.makedirs(d, exist_ok=True)
        return d
    return os.getcwd()


class StopReason(Enum):
    TOOL_CALLS = "tool_calls"
    DONE = "done"
    ERROR = "error"


@dataclass
class ToolCall:
    tool_name: str
    tool_call_id: str
    arguments: Dict[str, Any]


@dataclass
class ToolResult:
    tool_call_id: str
    tool_name: str
    result: Any
    is_error: bool = False


@dataclass
class Tool:
    name: str
    description: str
    input_schema: Dict[str, Any]
    handler: Callable


TOOL_REGISTRY: Dict[str, Tool] = {}


def register_tool(name: str, description: str, input_schema: Dict[str, Any]):
    def decorator(func: Callable):
        tool = Tool(
            name=name,
            description=description,
            input_schema=input_schema,
            handler=func
        )
        TOOL_REGISTRY[name] = tool
        return func
    return decorator


def get_tools() -> List[Dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema
            }
        }
        for tool in TOOL_REGISTRY.values()
    ]


def dispatch_tool(tool_name: str, tool_call_id: str, arguments) -> ToolResult:
    if tool_name not in TOOL_REGISTRY:
        return ToolResult(
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            result=f"Tool {tool_name} not found",
            is_error=True
        )

    tool = TOOL_REGISTRY[tool_name]
    try:
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                arguments = {}
        result = tool.handler(**arguments)
        return ToolResult(
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            result=result
        )
    except Exception as e:
        return ToolResult(
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            result=str(e),
            is_error=True
        )


@register_tool(
    name="bashTool",
    description="Execute a shell command in the project directory. Use for running build tools, npm, git, etc.",
    input_schema={
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "The shell command to execute (runs in project sandbox directory)"}
        },
        "required": ["command"]
    }
)
def bash_tool(command: str) -> str:
    import subprocess
    cwd = _project_dir()
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=cwd,
        )
        output = result.stdout
        if result.stderr:
            output += "\n[STDERR]\n" + result.stderr
        return output if output else "(no output)"
    except subprocess.TimeoutExpired:
        return "Command timed out after 120 seconds"
    except Exception as e:
        return f"Error: {str(e)}"


@register_tool(
    name="readFileTool",
    description="Read the contents of a file",
    input_schema={
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Path to the file (relative to project directory)"}
        },
        "required": ["file"]
    }
)
def read_file_tool(file: str) -> str:
    try:
        # 如果是绝对路径直接用；否则拼接到项目目录
        if not os.path.isabs(file):
            file = os.path.join(_project_dir(), file)
        with open(file, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"


@register_tool(
    name="writeFileTool",
    description="Write content to a file. Creates the file if it doesn't exist. All files go into the project sandbox directory.",
    input_schema={
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Path to the file (relative to project directory)"},
            "content": {"type": "string", "description": "Content to write"}
        },
        "required": ["file", "content"]
    }
)
def write_file_tool(file: str, content: str) -> str:
    try:
        if not os.path.isabs(file):
            file = os.path.join(_project_dir(), file)
        dir_path = os.path.dirname(file)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        with open(file, "w", encoding="utf-8") as f:
            f.write(content)

        # Auto-start sandbox when first file is written
        _ensure_sandbox_running()

        return f"File written: {file}"
    except Exception as e:
        return f"Error writing file: {str(e)}"


def _ensure_sandbox_running() -> None:
    """Start the sandbox server if not already running (idempotent)."""
    from app.harness.sandbox_manager import get_sandbox_manager
    repo_id = get_current_repo_id()
    if not repo_id:
        return
    try:
        mgr = get_sandbox_manager()
        # init_project creates dir + writes port_map.json if missing
        mgr.init_project(repo_id)
        # start_dev_server is idempotent (checks is_running)
        mgr.start_dev_server(repo_id)
    except Exception:
        pass  # Non-critical — sandbox start failures shouldn't block file writes


@register_tool(
    name="searchFilesTool",
    description="Search for text in files within a directory",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Text to search for"},
            "path": {"type": "string", "description": "Directory path to search in (relative to project directory)"}
        },
        "required": ["query"]
    }
)
def search_files_tool(query: str, path: str = ".") -> str:
    import subprocess
    search_dir = os.path.join(_project_dir(), path) if not os.path.isabs(path) else path
    try:
        result = subprocess.run(
            f'grep -rn "{query}" {search_dir}',
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout if result.stdout else "No matches found"
    except Exception as e:
        return f"Error searching: {str(e)}"


@register_tool(
    name="listFilesTool",
    description="List files in a directory",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Directory path (relative to project directory)"},
            "recursive": {"type": "boolean", "description": "List recursively"}
        }
    }
)
def list_files_tool(path: str = ".", recursive: bool = False) -> str:
    import subprocess
    list_dir = os.path.join(_project_dir(), path) if not os.path.isabs(path) else path
    try:
        flag = "-R" if recursive else ""
        result = subprocess.run(
            f"ls {flag} -la {list_dir}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return result.stdout
    except Exception as e:
        return f"Error listing files: {str(e)}"


@register_tool(
    name="replaceInFileTool",
    description="Replace text in a file",
    input_schema={
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Path to the file (relative to project directory)"},
            "old_text": {"type": "string", "description": "Text to replace"},
            "new_text": {"type": "string", "description": "Replacement text"}
        },
        "required": ["file", "old_text", "new_text"]
    }
)
def replace_in_file_tool(file: str, old_text: str, new_text: str) -> str:
    try:
        if not os.path.isabs(file):
            file = os.path.join(_project_dir(), file)
        with open(file, "r", encoding="utf-8") as f:
            content = f.read()
        if old_text not in content:
            return f"Text not found in file: {old_text}"
        content = content.replace(old_text, new_text)
        with open(file, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Replaced in {file}"
    except Exception as e:
        return f"Error replacing text: {str(e)}"


@register_tool(
    name="checkAppTool",
    description="Check if an application is running on a port",
    input_schema={
        "type": "object",
        "properties": {
            "port": {"type": "integer", "description": "Port number to check"}
        },
        "required": ["port"]
    }
)
def check_app_tool(port: int) -> str:
    import subprocess
    try:
        result = subprocess.run(
            f'curl -s -o /dev/null -w "%{{http_code}}" http://localhost:{port}',
            shell=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        code = result.stdout.strip()
        if code == "200":
            return f"App is running on port {port}"
        else:
            return f"App not responding on port {port} (status: {code})"
    except Exception as e:
        return f"Error checking app: {str(e)}"


@register_tool(
    name="appendToFileTool",
    description="Append content to the end of a file. Creates the file if it doesn't exist.",
    input_schema={
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Path to the file (relative to project directory)"},
            "content": {"type": "string", "description": "Content to append"}
        },
        "required": ["file", "content"]
    }
)
def append_to_file_tool(file: str, content: str) -> str:
    try:
        if not os.path.isabs(file):
            file = os.path.join(_project_dir(), file)
        dir_path = os.path.dirname(file)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        with open(file, "a", encoding="utf-8") as f:
            f.write(content)
        return f"Content appended to: {file}"
    except Exception as e:
        return f"Error appending to file: {str(e)}"


@register_tool(
    name="makeDirectoryTool",
    description="Create a new directory or folder",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Path of the directory to create (relative to project directory)"},
            "recursive": {"type": "boolean", "description": "Create parent directories if they don't exist", "default": True}
        },
        "required": ["path"]
    }
)
def make_directory_tool(path: str, recursive: bool = True) -> str:
    try:
        if not os.path.isabs(path):
            path = os.path.join(_project_dir(), path)
        if recursive:
            os.makedirs(path, exist_ok=True)
        else:
            os.mkdir(path)
        return f"Directory created: {path}"
    except Exception as e:
        return f"Error creating directory: {str(e)}"


@register_tool(
    name="movePathTool",
    description="Move or rename a file or directory",
    input_schema={
        "type": "object",
        "properties": {
            "from": {"type": "string", "description": "Source path (relative to project directory)"},
            "to": {"type": "string", "description": "Destination path (relative to project directory)"}
        },
        "required": ["from", "to"]
    }
)
def move_path_tool(**kwargs: Any) -> str:
    """JSON 使用键名 from，不能作为 Python 形参名，故用 **kwargs。"""
    import shutil
    src = kwargs.get("from") or kwargs.get("from_path")
    dst = kwargs.get("to") or kwargs.get("to_path")
    if not src or not dst:
        return "Error moving path: missing 'from' or 'to'"
    if not os.path.isabs(src):
        src = os.path.join(_project_dir(), src)
    if not os.path.isabs(dst):
        dst = os.path.join(_project_dir(), dst)
    try:
        shutil.move(src, dst)
        return f"Moved: {src} -> {dst}"
    except Exception as e:
        return f"Error moving path: {str(e)}"


@register_tool(
    name="deletePathTool",
    description="Delete a file or directory",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Path to delete (relative to project directory)"},
            "recursive": {"type": "boolean", "description": "Delete directories recursively", "default": False}
        },
        "required": ["path"]
    }
)
def delete_path_tool(path: str, recursive: bool = False) -> str:
    import shutil
    try:
        if not os.path.isabs(path):
            path = os.path.join(_project_dir(), path)
        if os.path.isdir(path):
            if recursive:
                shutil.rmtree(path)
            else:
                os.rmdir(path)
        else:
            os.remove(path)
        return f"Deleted: {path}"
    except Exception as e:
        return f"Error deleting path: {str(e)}"


# ---- Dev Server & Preview Tools --------------------------------------------

@register_tool(
    name="startDevServerTool",
    description="Start the development server for the current project. This will make the project visible in the right-side preview panel. Call this after writing files so the user can see the result.",
    input_schema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
def start_dev_server_tool() -> str:
    from app.harness.sandbox_manager import get_sandbox_manager
    repo_id = get_current_repo_id()
    if not repo_id:
        return "Error: No project context. Cannot start dev server."
    mgr = get_sandbox_manager()
    result = mgr.start_dev_server(repo_id)
    if result.get("success"):
        preview_url = result.get("preview_url", "")
        # iframe 通过 /api/sandbox-preview/<repoId> 同源代理访问，
        # 因此传给前端的 URL 必须是这个代理路径，而不是 localhost:port。
        proxy_url = f"/api/sandbox-preview/{repo_id}"
        return (
            f"Dev server started: internal port {result.get('preview_url', '')}\n"
            f"Preview URL (use this): {proxy_url}\n"
            f"The project is now visible in the right-side preview panel."
        )
    else:
        return f"Failed to start dev server: {result.get('message', 'unknown error')}"


@register_tool(
    name="getPreviewUrlTool",
    description="Get the current preview URL for the project. Call this to check if the dev server is running and get the URL to view the project.",
    input_schema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
def get_preview_url_tool() -> str:
    from app.harness.sandbox_manager import get_sandbox_manager
    repo_id = get_current_repo_id()
    if not repo_id:
        return "Error: No project context."
    mgr = get_sandbox_manager()
    status = mgr.get_status(repo_id)
    if not status.get("exists"):
        return "Error: Project sandbox not initialized."
    preview_url = status.get("preview_url", "")
    if status.get("is_running"):
        proxy_url = f"/api/sandbox-preview/{repo_id}"
        return (
            f"Preview URL: {proxy_url}\n"
            f"Dev server is running (internal: {preview_url}). "
            f"View the project in the right-side preview panel."
        )
    else:
        return (
            f"Dev server not running.\n"
            f"Project directory: {status.get('project_dir', '')}\n"
            f"Call startDevServerTool to start it."
        )


@register_tool(
    name="commitTool",
    description="Commit changes to git repository with a message",
    input_schema={
        "type": "object",
        "properties": {
            "message": {"type": "string", "description": "Git commit message"},
            "path": {"type": "string", "description": "Path to the git repository", "default": "."}
        },
        "required": ["message"]
    }
)
def commit_tool(message: str, path: str = ".") -> str:
    import subprocess
    try:
        cwd = _project_dir()
        subprocess.run(["git", "-C", cwd, "add", "-A"], check=True, capture_output=True)
        result = subprocess.run(
            ["git", "-C", cwd, "commit", "-m", message],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return f"Committed successfully:\n{result.stdout}"
        else:
            return f"Commit failed:\n{result.stderr}"
    except subprocess.CalledProcessError as e:
        return f"Git error: {str(e)}"
    except Exception as e:
        return f"Error: {str(e)}"


@register_tool(
    name="devServerLogsTool",
    description="Read recent development server logs",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Log file path (relative to project directory)", "default": "/tmp/dev-server.log"},
            "maxLines": {"type": "integer", "description": "Maximum number of lines to return", "default": 50}
        }
    }
)
def dev_server_logs_tool(path: str = "/tmp/dev-server.log", maxLines: int = 50) -> str:
    try:
        if not os.path.isabs(path):
            path = os.path.join(_project_dir(), path)
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        recent = lines[-maxLines:] if len(lines) > maxLines else lines
        return "".join(recent) if recent else "No logs available"
    except FileNotFoundError:
        return "Log file not found"
    except Exception as e:
        return f"Error reading logs: {str(e)}"


@register_tool(
    name="updateProjectPreviewTool",
    description="Update the project metadata (preview URL, dev terminal URL) so the frontend preview panel can display the project. Call this AFTER starting the dev server.",
    input_schema={
        "type": "object",
        "properties": {
            "previewUrl": {"type": "string", "description": "The preview URL returned by startDevServerTool"},
            "devCommandTerminalUrl": {"type": "string", "description": "The dev command terminal URL (usually same as previewUrl)"},
            "additionalTerminalsUrl": {"type": "string", "description": "URL for additional terminals"}
        },
        "required": ["previewUrl"]
    }
)
def update_project_preview_tool(
    previewUrl: str,
    devCommandTerminalUrl: Optional[str] = None,
    additionalTerminalsUrl: Optional[str] = None,
) -> str:
    """
    将项目的预览 URL 持久化到 Go Backend。
    前端 loadRepos() 读取 vm.previewUrl，iframe 据此显示页面。

    previewUrl 可以是：
    - "/api/sandbox-preview/<repoId>"  (代理路径，推荐)
    - "http://localhost:31000"          (内部端口，自动转为代理路径)
    """
    import httpx
    from app.core.config import get_settings

    repo_id = get_current_repo_id()
    if not repo_id:
        return "Error: No project context."

    settings = get_settings()
    dev_terminal = devCommandTerminalUrl or previewUrl
    additional = additionalTerminalsUrl or previewUrl

    # 自动将 localhost 端口转换为代理路径
    stored_preview_url = previewUrl
    if "localhost" in previewUrl or "127.0.0.1" in previewUrl:
        stored_preview_url = f"/api/sandbox-preview/{repo_id}"

    token = get_current_token()
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.put(
                f"{settings.backend_url}/api/projects/{repo_id}/vm",
                json={
                    "vm_id": repo_id,
                    "source_repo_id": repo_id,
                    "preview_url": stored_preview_url,
                    "dev_command_terminal_url": dev_terminal,
                    "additional_terminals_url": additional,
                },
                headers=headers,
            )
        if resp.status_code in (200, 201):
            return (
                f"Project preview URL saved: {stored_preview_url}\n"
                "The right-side preview panel should now show your project."
            )
        return f"Warning: updateProjectPreviewTool returned {resp.status_code}. Dev server is running but preview may not appear automatically."
    except Exception as e:
        return f"Warning: Could not update project metadata: {str(e)}. Dev server is running."

