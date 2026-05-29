"""
Harness Tool System — 用户目录操作模式
基于 votx-agent 风格：所有工具在用户目录下操作，支持沙箱安全校验。
"""
import json
import os
import re
import shutil
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from app.harness._common import (
    check_dangerous_command,
    check_sandbox,
    err,
    get_current_user_dir,
    safe_path,
    safe_working_dir,
    sanitize_env,
    set_current_user_dir,
    truncate,
    validate_url,
    _fmt_size,
)

# ---------------------------------------------------------------------------
# Context: 每个 chat 请求携带 user_id，工具们通过这个 thread-local 变量
# 知道当前操作用户的工作目录。
# ---------------------------------------------------------------------------
_context = threading.local()


def set_current_context(user_id: Optional[str], token: Optional[str] = None) -> None:
    _context.user_id = user_id
    _context.token = token


def get_current_user_id() -> Optional[str]:
    return getattr(_context, "user_id", None)


def get_current_token() -> Optional[str]:
    return getattr(_context, "token", None)


def _get_work_dir() -> str:
    """
    返回当前用户的工作目录。
    优先用 VOTX_USER_DIR 环境变量（可配置），否则用用户目录。
    """
    work_dir = get_current_user_dir()
    if not work_dir:
        user_id = get_current_user_id()
        if user_id:
            from app.core.config import get_settings
            settings = get_settings()
            work_dir = os.path.join(settings.user_data_root, user_id)
    if not work_dir:
        work_dir = os.getcwd()
    os.makedirs(work_dir, exist_ok=True)
    return work_dir


# ---------------------------------------------------------------------------
# StopReason
# ---------------------------------------------------------------------------
class StopReason:
    TOOL_CALLS = "tool_calls"
    DONE = "done"
    ERROR = "error"


# ---------------------------------------------------------------------------
# Tool 数据类
# ---------------------------------------------------------------------------
class ToolCall:
    tool_name: str
    tool_call_id: str
    arguments: Dict[str, Any]


class ToolResult:
    def __init__(self, tool_call_id: str, tool_name: str, result: Any, is_error: bool = False):
        self.tool_call_id = tool_call_id
        self.tool_name = tool_name
        self.result = result
        self.is_error = is_error


class Tool:
    def __init__(self, name: str, description: str, input_schema: Dict[str, Any], handler: Callable):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.handler = handler


# ---------------------------------------------------------------------------
# 工具注册表
# ---------------------------------------------------------------------------
TOOL_REGISTRY: Dict[str, Tool] = {}


def register_tool(name: str, description: str, input_schema: Dict[str, Any]):
    def decorator(func: Callable):
        tool = Tool(name=name, description=description, input_schema=input_schema, handler=func)
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
        return ToolResult(tool_call_id=tool_call_id, tool_name=tool_name, result=result)
    except Exception as e:
        return ToolResult(tool_call_id=tool_call_id, tool_name=tool_name, result=str(e), is_error=True)


async def dispatch_tool_async(tool_name: str, tool_call_id: str, arguments) -> ToolResult:
    import asyncio
    captured_user_id = get_current_user_id()
    captured_token = get_current_token()

    def _sync_wrapper():
        set_current_context(captured_user_id, captured_token)
        return dispatch_tool(tool_name, tool_call_id, arguments)

    return await asyncio.to_thread(_sync_wrapper)


# ---------------------------------------------------------------------------
# 工具实现
# ---------------------------------------------------------------------------

@register_tool(
    name="bashTool",
    description="Execute a shell command. shell=False 安全模式，危险命令被拦截。支持任意命令，超时 120 秒。",
    input_schema={
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "要执行的命令（shlex 解析）"},
            "working_dir": {"type": "string", "description": "工作目录（可选，默认用户目录）"}
        },
        "required": ["command"]
    }
)
def bash_tool(command: str, working_dir: str = "") -> str:
    import shlex

    if not command.strip():
        return err("命令为空")

    danger_err = check_dangerous_command(command)
    if danger_err:
        return err(danger_err)

    wd = working_dir.strip() or _get_work_dir()
    wd_err = safe_working_dir(wd)
    if wd_err:
        return err(wd_err)

    cwd = Path(wd).resolve()

    # cmd.exe /c 时注入 UTF-8 代码页，防止中文路径乱码
    cmd = command.strip()
    if cmd[:4].lower() == "cmd " or cmd[:8].lower() == "cmd.exe ":
        m = re.match(r'(cmd(\.exe)?)\s+(/[ck])\s+', cmd, re.IGNORECASE)
        if m:
            rest = cmd[m.end():].strip()
            if rest.startswith('"') and rest.endswith('"'):
                rest = rest[1:-1]
            rest_escaped = rest.replace('"', '\\"')
            cmd = f'{m.group(1)} {m.group(3)} "chcp 65001 > nul & {rest_escaped}"'

    try:
        args = shlex.split(cmd)
    except ValueError as e:
        return err(f"命令解析失败: {e}")

    try:
        r = subprocess.run(
            args,
            shell=False,
            capture_output=True,
            timeout=120,
            encoding="utf-8",
            errors="replace",
            text=True,
            cwd=str(cwd),
            env=sanitize_env(),
        )
        output = r.stdout.strip() or r.stderr.strip() or f"(exit={r.returncode})"
        return truncate(output, max_len=100000)
    except FileNotFoundError:
        return err(f"命令未找到: {args[0]}")
    except subprocess.TimeoutExpired:
        return err("命令超时 (120s)")
    except Exception as e:
        return err(f"执行失败: {e}")


@register_tool(
    name="readFileTool",
    description="Read the contents of a file. 受沙箱保护（只能在项目根或用户目录下读取）。支持 UTF-8 和 GBK 编码自动回退，附带 20MB 大小限制。",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径（相对或绝对路径）"}
        },
        "required": ["path"]
    }
)
def read_file_tool(path: str) -> str:
    p = safe_path(path)
    if p is None:
        return err(f"无效路径: {path}")

    resolved = check_sandbox(p)
    if not resolved:
        return err(f"路径越权，只能在项目根或用户目录下读取: {path}")

    if not resolved.exists():
        return err(f"文件不存在: {resolved}")
    if resolved.is_dir():
        return err(f"路径是目录而非文件: {resolved}")

    try:
        size = resolved.stat().st_size
        if size > 20 * 1024 * 1024:
            return err(f"文件过大，无法读取（超过20MB）: {resolved}")
    except OSError:
        pass

    try:
        content = resolved.read_text(encoding="utf-8")
        return truncate(content)
    except UnicodeDecodeError:
        try:
            content = resolved.read_text(encoding="gbk")
            return truncate(content)
        except Exception as e:
            return err(f"读取失败（编码错误）: {e}")
    except Exception as e:
        return err(f"读取失败: {e}")


@register_tool(
    name="writeFileTool",
    description="Write content to a file. 自动创建父目录。沙箱保护，若路径越权则写入到用户目录下的同名文件。",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径（相对或绝对路径）"},
            "content": {"type": "string", "description": "要写入的内容"}
        },
        "required": ["path", "content"]
    }
)
def write_file_tool(path: str, content: str) -> str:
    p = safe_path(path)
    if p is None:
        return err(f"无效路径: {path}")

    resolved = check_sandbox(p)

    if not resolved:
        fallback_dir = _get_work_dir()
        resolved = Path(fallback_dir).resolve() / p.name

    try:
        if resolved.exists() and resolved.is_dir():
            return err(f"路径已存在且是目录，无法覆盖: {resolved}")
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content, encoding="utf-8")
        return f"OK: 已写入 {resolved} ({len(content)} 字符)"
    except Exception as e:
        return err(f"写入失败: {e}")


@register_tool(
    name="searchFilesTool",
    description="Search for text in files within a directory",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "要搜索的文本"},
            "path": {"type": "string", "description": "搜索目录路径（相对或绝对路径，默认当前用户目录）"}
        },
        "required": ["query"]
    }
)
def search_files_tool(query: str, path: str = "") -> str:
    search_dir_str = path.strip() or _get_work_dir()
    search_dir = safe_path(search_dir_str)
    if not search_dir:
        return err(f"无效路径: {search_dir_str}")

    resolved = check_sandbox(search_dir)
    if not resolved:
        return err(f"路径越权，只能搜索项目根或用户目录: {search_dir_str}")

    try:
        results = []
        for root, _, files in os.walk(resolved):
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        lines = f.readlines()
                    for i, line in enumerate(lines, 1):
                        if query in line:
                            rel = os.path.relpath(fpath, resolved)
                            results.append(f"{rel}:{i}: {line.rstrip()}")
                except Exception:
                    pass
        if results:
            return "\n".join(results)
        return "No matches found"
    except Exception as e:
        return err(f"搜索失败: {e}")


@register_tool(
    name="listFilesTool",
    description="List files in a directory",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "目录路径（相对或绝对路径，默认用户目录）"},
            "recursive": {"type": "boolean", "description": "递归列出"}
        }
    }
)
def list_files_tool(path: str = "", recursive: bool = False) -> str:
    list_dir_str = path.strip() or _get_work_dir()
    list_dir = safe_path(list_dir_str)
    if not list_dir:
        return err(f"无效路径: {list_dir_str}")

    resolved = check_sandbox(list_dir)
    if not resolved:
        return err(f"路径越权，只能列出项目根或用户目录: {list_dir_str}")

    if not resolved.exists():
        return err(f"目录不存在: {resolved}")
    if not resolved.is_dir():
        return err(f"不是目录: {resolved}")

    lines = []
    try:
        if recursive:
            for root, dirs, files in os.walk(resolved):
                rel_root = os.path.relpath(root, resolved)
                if rel_root == ".":
                    rel_root = ""
                for d in sorted(dirs):
                    p = os.path.join(rel_root, d) if rel_root else d
                    lines.append(f"{p}/")
                for f in sorted(files):
                    p = os.path.join(rel_root, f) if rel_root else f
                    lines.append(p)
        else:
            for entry in sorted(resolved.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
                tag = "/" if entry.is_dir() else ""
                try:
                    size = entry.stat().st_size
                    size_str = _fmt_size(size) if entry.is_file() else "-"
                except OSError:
                    size_str = "-"
                lines.append(f"{entry.name}{tag}  ({size_str})")
        return "\n".join(lines) if lines else "(empty directory)"
    except Exception as e:
        return err(f"列目录失败: {e}")


@register_tool(
    name="replaceInFileTool",
    description="Replace text in a file",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径"},
            "old_text": {"type": "string", "description": "被替换的文本"},
            "new_text": {"type": "string", "description": "替换后的文本"}
        },
        "required": ["path", "old_text", "new_text"]
    }
)
def replace_in_file_tool(path: str, old_text: str, new_text: str) -> str:
    p = safe_path(path)
    if p is None:
        return err(f"无效路径: {path}")

    resolved = check_sandbox(p)
    if not resolved:
        return err(f"路径越权: {path}")

    if not resolved.exists():
        return err(f"文件不存在: {resolved}")
    if resolved.is_dir():
        return err(f"路径是目录: {resolved}")

    try:
        content = resolved.read_text(encoding="utf-8")
        if old_text not in content:
            return err(f"文本未找到: {old_text[:100]}")
        content = content.replace(old_text, new_text)
        resolved.write_text(content, encoding="utf-8")
        return f"OK: 已替换 {resolved}"
    except Exception as e:
        return err(f"替换失败: {e}")


@register_tool(
    name="checkAppTool",
    description="Check if an application is running on a port",
    input_schema={
        "type": "object",
        "properties": {
            "port": {"type": "string", "description": "端口号"}
        },
        "required": ["port"]
    }
)
def check_app_tool(port: str) -> str:
    import urllib.request
    import urllib.error
    try:
        resp = urllib.request.urlopen(f"http://localhost:{port}", timeout=5)
        return f"App is running on port {port} (status: {resp.status})"
    except urllib.error.HTTPError as e:
        return f"App is running on port {port} (status: {e.code})"
    except Exception as e:
        return f"App not responding on port {port} (error: {str(e)})"


@register_tool(
    name="appendToFileTool",
    description="Append content to the end of a file. Creates the file if it doesn't exist.",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径"},
            "content": {"type": "string", "description": "要追加的内容"}
        },
        "required": ["path", "content"]
    }
)
def append_to_file_tool(path: str, content: str) -> str:
    p = safe_path(path)
    if p is None:
        return err(f"无效路径: {path}")

    resolved = check_sandbox(p)
    if not resolved:
        fallback_dir = _get_work_dir()
        resolved = Path(fallback_dir).resolve() / p.name

    try:
        resolved.parent.mkdir(parents=True, exist_ok=True)
        with open(resolved, "a", encoding="utf-8") as f:
            f.write(content)
        return f"OK: 已追加到 {resolved} ({len(content)} 字符)"
    except Exception as e:
        return err(f"追加失败: {e}")


@register_tool(
    name="makeDirectoryTool",
    description="Create a new directory or folder",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "目录路径"},
            "recursive": {"type": "boolean", "description": "递归创建父目录", "default": True}
        },
        "required": ["path"]
    }
)
def make_directory_tool(path: str, recursive: bool = True) -> str:
    p = safe_path(path)
    if p is None:
        return err(f"无效路径: {path}")

    resolved = check_sandbox(p)
    if not resolved:
        fallback_dir = _get_work_dir()
        resolved = Path(fallback_dir).resolve() / p.name

    try:
        if recursive:
            resolved.mkdir(parents=True, exist_ok=True)
        else:
            resolved.mkdir(parents=False)
        return f"OK: 已创建目录 {resolved}"
    except Exception as e:
        return err(f"创建目录失败: {e}")


@register_tool(
    name="movePathTool",
    description="Move or rename a file or directory",
    input_schema={
        "type": "object",
        "properties": {
            "from": {"type": "string", "description": "源路径"},
            "to": {"type": "string", "description": "目标路径"}
        },
        "required": ["from", "to"]
    }
)
def move_path_tool(from_: str = "", to: str = "") -> str:
    src = safe_path(from_)
    if src is None:
        return err(f"无效源路径: {from_}")
    resolved_src = check_sandbox(src)
    if not resolved_src:
        return err(f"源路径越权: {from_}")

    dst = safe_path(to)
    if dst is None:
        return err(f"无效目标路径: {to}")
    resolved_dst = check_sandbox(dst)
    if not resolved_dst:
        fallback_dir = _get_work_dir()
        resolved_dst = Path(fallback_dir).resolve() / Path(to).name

    try:
        shutil.move(str(resolved_src), str(resolved_dst))
        return f"OK: 已移动 {resolved_src} -> {resolved_dst}"
    except Exception as e:
        return err(f"移动失败: {e}")


@register_tool(
    name="deletePathTool",
    description="Delete a file or directory",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "路径"},
            "recursive": {"type": "boolean", "description": "递归删除目录", "default": False}
        },
        "required": ["path"]
    }
)
def delete_path_tool(path: str, recursive: bool = False) -> str:
    p = safe_path(path)
    if p is None:
        return err(f"无效路径: {path}")

    resolved = check_sandbox(p)
    if not resolved:
        return err(f"路径越权: {path}")

    if not resolved.exists():
        return err(f"路径不存在: {resolved}")

    try:
        if resolved.is_dir():
            if recursive:
                shutil.rmtree(resolved)
            else:
                os.rmdir(resolved)
        else:
            resolved.unlink()
        return f"OK: 已删除 {resolved}"
    except Exception as e:
        return err(f"删除失败: {e}")


@register_tool(
    name="commitTool",
    description="Commit changes to git repository with a message",
    input_schema={
        "type": "object",
        "properties": {
            "message": {"type": "string", "description": "Git commit message"},
            "path": {"type": "string", "description": "Git 仓库路径（默认用户目录）"}
        },
        "required": ["message"]
    }
)
def commit_tool(message: str, path: str = "") -> str:
    cwd_str = path.strip() or _get_work_dir()
    cwd = safe_path(cwd_str)
    if not cwd:
        return err(f"无效路径: {cwd_str}")
    resolved = check_sandbox(cwd)
    if not resolved:
        return err(f"路径越权: {cwd_str}")

    try:
        subprocess.run(["git", "-C", str(resolved), "add", "-A"], check=True, capture_output=True)
        result = subprocess.run(
            ["git", "-C", str(resolved), "commit", "-m", message],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            return f"OK: 提交成功\n{result.stdout}"
        return err(f"提交失败: {result.stderr}")
    except subprocess.CalledProcessError as e:
        return err(f"Git 错误: {str(e)}")
    except FileNotFoundError:
        return err("Git 未安装或不在 PATH 中")
    except Exception as e:
        return err(f"错误: {str(e)}")


# ---- 预览相关 ----

@register_tool(
    name="startPreviewTool",
    description="启动项目预览服务（在用户目录下启动 HTTP 服务器，端口由路径哈希决定）。调用此工具后文件变更可通过预览查看。",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "预览目录路径（默认用户目录）", "default": ""}
        },
        "required": []
    }
)
def start_preview_tool(path: str = "") -> str:
    from app.core.config import get_settings
    preview_dir_str = path.strip() or _get_work_dir()
    preview_dir = safe_path(preview_dir_str)
    if not preview_dir:
        return err(f"无效路径: {preview_dir_str}")
    resolved = check_sandbox(preview_dir)
    if not resolved:
        return err(f"路径越权: {preview_dir_str}")

    settings = get_settings()
    port = settings.preview_port_start + (hash(str(resolved)) % settings.preview_port_count)

    try:
        existing = subprocess.run(
            ["python", "-m", "http.server", str(port)],
            shell=False,
            capture_output=True,
            cwd=str(resolved),
            timeout=2,
        )
    except Exception:
        pass

    import threading
    def _run():
        subprocess.run(
            ["python", "-m", "http.server", str(port), "--bind", "0.0.0.0"],
            cwd=str(resolved),
            shell=False,
        )

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    import time
    time.sleep(1)

    return (
        f"OK: 预览服务已启动\n"
        f"目录: {resolved}\n"
        f"预览地址: http://localhost:{port}\n"
        f"（前端需配置 /api/preview 代理到对应端口）"
    )


@register_tool(
    name="getPreviewUrlTool",
    description="获取当前项目的预览 URL",
    input_schema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
def get_preview_url_tool() -> str:
    from app.core.config import get_settings
    settings = get_settings()
    work_dir = _get_work_dir()
    resolved = Path(work_dir).resolve()
    port = settings.preview_port_start + (hash(str(resolved)) % settings.preview_port_count)

    return (
        f"预览地址: http://localhost:{port}\n"
        f"工作目录: {resolved}\n"
        f"调用 startPreviewTool 启动预览服务"
    )
