"""
Project Sandbox Manager

每个项目（project/repo）拥有：
1. 独立的代码目录  (<sandbox_root>/<project_id>/)
2. 一个 HTTP 静态预览服务器（子进程）
3. 一个 dev server 进程（如果项目有 package.json dev 脚本）

服务器绑定 0.0.0.0，允许宿主机浏览器通过 localhost:<port> 访问。
PORT 由 project_id 的确定性哈希决定（与 Next.js /api/sandbox-preview 端口映射一致）。
"""

import os
import subprocess
import threading
import time
import signal
import json
import sys
import shlex
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 全局配置
# ---------------------------------------------------------------------------

def _get_sandbox_root() -> str:
    """跨平台沙箱根目录：Linux 用 /tmp，Windows 用 %TEMP%"""
    if sys.platform == "win32":
        return os.path.join(os.environ.get("TEMP", "C:\\temp"), "codewiz-sandbox")
    return os.environ.get("CODEWIZ_SANDBOX_ROOT", "/tmp/codewiz-sandbox")

SANDBOX_ROOT = _get_sandbox_root()

# 端口范围：31000 - 31999（共 1000 个槽位，映射 31000 + hash % 1000）
SANDBOX_PORT_START = 31000
SANDBOX_PORT_COUNT = 1000


def _project_id_hash_port(project_id: str) -> int:
    """Deterministic rolling hash (same logic must be replicated in Next.js sandbox-preview route)."""
    # FNV-1a-inspired rolling hash: same as the JS `simpleHash()` in sandbox-preview route
    h = 2166136261
    for ch in project_id.encode():
        h ^= ch
        h = (h * 16777619) & 0xFFFFFFFF
    return SANDBOX_PORT_START + (h % SANDBOX_PORT_COUNT)


def _get_python_cmd() -> str:
    """跨平台 Python 命令"""
    if sys.platform == "win32":
        return "python"
    return "python3"


def _get_preview_host() -> str:
    """
    返回预览服务器的主机地址（浏览器需要访问的地址）。
    - 在 Docker 里运行 → host.docker.internal（宿主机 IP）
    - 本地 Windows/Linux → localhost
    """
    if os.environ.get("DOCKER_CONTAINER"):
        return "host.docker.internal"
    if os.path.exists("/.dockerenv"):
        return "host.docker.internal"
    return "localhost"


def _safe_kill_process_tree(proc: subprocess.Popen) -> None:
    """安全终止整个进程树，跨平台兼容"""
    if sys.platform == "win32":
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True,
                timeout=10
            )
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    else:
        try:
            import os
            import signal
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass


@dataclass
class DevServer:
    """单个项目的 dev server + 静态预览服务器"""
    project_id: str
    port: int
    dev_process: Optional[subprocess.Popen] = None
    static_process: Optional[subprocess.Popen] = None
    dev_log_file: Optional[str] = None
    static_log_file: Optional[str] = None
    started_at: float = field(default_factory=time.time)

    @property
    def preview_url(self) -> str:
        host = _get_preview_host()
        return f"http://{host}:{self.port}"

    @property
    def dev_command_terminal_url(self) -> str:
        return self.preview_url

    @property
    def is_running(self) -> bool:
        # static_process 是兜底静态服务器，必须运行
        return self.static_process is not None and self.static_process.poll() is None


PORT_MAP_FILE = os.path.join(SANDBOX_ROOT, "port_map.json")


def _load_port_map() -> dict[str, int]:
    """Load persisted port map from JSON file (if exists)."""
    try:
        with open(PORT_MAP_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_port_map(m: dict[str, int]) -> None:
    """Persist port map to JSON file."""
    with open(PORT_MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(m, f)


class SandboxManager:
    """
    全局单例，管理所有项目的 sandbox。
    线程安全。
    """

    def __init__(self):
        self._sandboxes: dict[str, DevServer] = {}
        self._lock = threading.RLock()
        os.makedirs(SANDBOX_ROOT, exist_ok=True)
        self._port_map = _load_port_map()
        # Hydrate running sandboxes from persisted port map
        for project_id, port in list(self._port_map.items()):
            self._sandboxes[project_id] = DevServer(project_id=project_id, port=port)

    def get_project_dir(self, project_id: str) -> str:
        """获取项目的代码目录"""
        return os.path.join(SANDBOX_ROOT, project_id)

    def ensure_project_dir(self, project_id: str) -> str:
        """确保项目目录存在，返回路径"""
        d = self.get_project_dir(project_id)
        os.makedirs(d, exist_ok=True)
        # 创建 logs 子目录
        logs_dir = os.path.join(d, ".codewiz-logs")
        os.makedirs(logs_dir, exist_ok=True)
        return d

    def _get_log_path(self, project_id: str, log_name: str) -> str:
        return os.path.join(self.ensure_project_dir(project_id), ".codewiz-logs", f"{log_name}.log")

    def get_sandbox(self, project_id: str) -> Optional[DevServer]:
        with self._lock:
            return self._sandboxes.get(project_id)

    def init_project(self, project_id: str) -> DevServer:
        """
        为新项目初始化 sandbox（创建目录）。
        如果已存在，直接返回。
        """
        with self._lock:
            if project_id in self._sandboxes:
                return self._sandboxes[project_id]

            project_dir = self.ensure_project_dir(project_id)
            port = _project_id_hash_port(project_id)

            sandbox = DevServer(
                project_id=project_id,
                port=port,
            )
            self._sandboxes[project_id] = sandbox
            self._port_map[project_id] = port
            _save_port_map(self._port_map)
            return sandbox

    def _detect_dev_command(self, project_dir: str) -> tuple[Optional[str], Optional[str]]:
        """
        检测项目类型，返回 (dev_command, static_root)。
        支持：Node.js (package.json)、Python、纯静态 HTML。
        """
        pkg_json = os.path.join(project_dir, "package.json")
        if os.path.isfile(pkg_json):
            try:
                with open(pkg_json, encoding="utf-8") as f:
                    pkg = json.load(f)
                scripts = pkg.get("scripts", {})
                # 优先 dev，其次 start/preview
                for key in ("dev", "start", "preview"):
                    cmd = scripts.get(key)
                    if cmd:
                        return cmd, project_dir
            except Exception as e:
                logger.warning(f"Failed to parse package.json: {e}")

        # Python Flask/FastAPI
        requirements = os.path.join(project_dir, "requirements.txt")
        if os.path.isfile(requirements):
            return None, project_dir

        # 纯 HTML/静态文件
        return None, project_dir

    def _start_static_server(self, port: int, directory: str, log_file: str) -> subprocess.Popen:
        """
        启动 HTTP 静态文件服务器。
        绑定 0.0.0.0 让宿主机浏览器可以访问。
        """
        log_fd = open(log_file, "a", encoding="utf-8", buffering=1)
        cmd = [
            _get_python_cmd(), "-m", "http.server",
            str(port),
            "--bind", "0.0.0.0",
            "--directory", directory,
        ]
        proc = subprocess.Popen(
            cmd,
            stdout=log_fd,
            stderr=subprocess.STDOUT,
            cwd=directory,
            shell=False,
        )
        return proc

    def _start_dev_command(self, dev_command: str, project_dir: str, log_file: str) -> Optional[subprocess.Popen]:
        """
        安全地启动 dev 命令，不使用 shell=True，避免命令注入风险。
        """
        try:
            # 使用 shlex.split 安全拆分命令
            args = shlex.split(dev_command, posix=(sys.platform != "win32"))
        except ValueError as e:
            logger.error(f"Failed to parse dev command: {e}")
            return None

        log_fd = open(log_file, "a", encoding="utf-8", buffering=1)

        kwargs = {
            "args": args,
            "stdout": log_fd,
            "stderr": subprocess.STDOUT,
            "cwd": project_dir,
            "shell": False,
        }
        if sys.platform != "win32":
            kwargs["preexec_fn"] = os.setsid

        proc = subprocess.Popen(**kwargs)
        return proc

    def start_dev_server(self, project_id: str) -> dict:
        """
        启动项目的 dev server + 静态预览服务。
        如果已经在运行，直接返回。
        """
        with self._lock:
            sandbox = self._sandboxes.get(project_id)
            if not sandbox:
                sandbox = self.init_project(project_id)

        project_dir = self.get_project_dir(project_id)

        # 如果已经运行中，直接返回
        if sandbox.is_running:
            return {
                "success": True,
                "preview_url": sandbox.preview_url,
                "dev_command_terminal_url": sandbox.dev_command_terminal_url,
                "additional_terminals_url": sandbox.preview_url,
                "message": "Dev server already running",
            }

        dev_command, static_root = self._detect_dev_command(project_dir)

        # 准备日志文件路径
        static_log = self._get_log_path(project_id, "static-server")
        dev_log = self._get_log_path(project_id, "dev-server")

        # 始终启动静态预览服务器（兜底，用于纯 HTML / 构建产物）
        static_proc = self._start_static_server(sandbox.port, static_root, static_log)
        logger.info(f"Static server for project {project_id} started, PID={static_proc.pid}, log={static_log}")

        dev_proc: Optional[subprocess.Popen] = None
        if dev_command:
            dev_proc = self._start_dev_command(dev_command, project_dir, dev_log)
            if dev_proc:
                logger.info(f"Dev server for project {project_id} started, PID={dev_proc.pid}, log={dev_log}")

        with self._lock:
            sandbox.dev_process = dev_proc
            sandbox.static_process = static_proc
            sandbox.dev_log_file = dev_log
            sandbox.static_log_file = static_log

        # 等待一小会让服务器启动
        time.sleep(2)

        return {
            "success": True,
            "preview_url": sandbox.preview_url,
            "dev_command_terminal_url": sandbox.dev_command_terminal_url,
            "additional_terminals_url": sandbox.preview_url,
            "message": "Dev server started",
        }

    def stop_dev_server(self, project_id: str) -> dict:
        """停止项目的 dev server，跨平台安全终止整个进程树"""
        with self._lock:
            sandbox = self._sandboxes.pop(project_id, None)

        if not sandbox:
            return {"success": True, "message": "No sandbox found"}

        for proc_name, proc in [("dev", sandbox.dev_process), ("static", sandbox.static_process)]:
            if proc:
                try:
                    logger.info(f"Stopping {proc_name} server PID={proc.pid} for project {project_id}")
                    _safe_kill_process_tree(proc)
                    logger.info(f"Successfully stopped {proc_name} server PID={proc.pid}")
                except Exception as e:
                    logger.warning(f"Error stopping {proc_name} server: {e}")

        return {"success": True, "message": "Dev server stopped"}

    def get_status(self, project_id: str) -> dict:
        """获取项目的 sandbox 状态"""
        with self._lock:
            sandbox = self._sandboxes.get(project_id)

        if not sandbox:
            return {
                "exists": False,
                "project_dir": self.get_project_dir(project_id),
            }

        return {
            "exists": True,
            "project_id": project_id,
            "project_dir": self.get_project_dir(project_id),
            "port": sandbox.port,
            "preview_url": sandbox.preview_url,
            "is_running": sandbox.is_running,
            "dev_log_file": sandbox.dev_log_file,
            "static_log_file": sandbox.static_log_file,
        }


# 全局单例
_manager: Optional[SandboxManager] = None


def get_sandbox_manager() -> SandboxManager:
    global _manager
    if _manager is None:
        _manager = SandboxManager()
    return _manager
