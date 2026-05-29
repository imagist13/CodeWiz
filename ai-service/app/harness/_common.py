"""skills 公共模块 — err / safe_path / check_sandbox / SSRF 防护 / 命令安全"""
import ipaddress
import json
import os
import re as _re
import socket
import threading
from contextvars import ContextVar, Token
from pathlib import Path
from urllib.parse import urlparse as _urlparse

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CURRENT_USER_DIR: ContextVar[str | None] = ContextVar("votx_current_user_dir", default=None)


def err(msg: str) -> str:
    return f"ERROR: {msg}"


def truncate(text: str, max_len: int = 0) -> str:
    if max_len > 0 and len(text) > max_len:
        return text[:max_len] + f"\n... (截断，共 {len(text)} 字符)"
    return text


def set_current_user_dir(user_dir: str | None) -> Token:
    return _CURRENT_USER_DIR.set(user_dir)


def reset_current_user_dir(token: Token):
    _CURRENT_USER_DIR.reset(token)


def get_current_user_dir() -> str:
    return _CURRENT_USER_DIR.get() or os.environ.get("VOTX_USER_DIR", "")


# ---- 路径安全 ----

def safe_path(raw_path: str) -> Path | None:
    try:
        p = Path(raw_path)
        if not p.is_absolute():
            p = _PROJECT_ROOT / p
        return p.resolve()
    except Exception:
        return None


def check_sandbox(p: Path, allowed_roots: list | None = None) -> Path | None:
    try:
        resolved = p.resolve()
    except Exception:
        return None
    roots = [Path(x) for x in (allowed_roots or []) if x]
    if not roots:
        roots.append(_PROJECT_ROOT)
        user_dir = get_current_user_dir()
        if user_dir:
            roots.append(Path(user_dir))
    for root in roots:
        try:
            resolved_root = root.resolve()
        except Exception:
            continue
        if resolved == resolved_root or resolved.is_relative_to(resolved_root):
            return resolved
    return None


# ---- SSRF 防护 ----

_SSRF_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

_CLOUD_METADATA_IPS = {"169.254.169.254"}


def _is_ip_blocked(host: str) -> bool:
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    for net in _SSRF_BLOCKED_NETWORKS:
        if addr in net:
            return True
    return False


def validate_url(url: str) -> str | None:
    try:
        parsed = _urlparse(url)
    except Exception:
        return "无效的 URL 格式"

    if parsed.scheme not in ("http", "https"):
        return f"不支持的协议: {parsed.scheme}，仅允许 http/https"

    host = parsed.hostname
    if not host:
        return "URL 缺少主机名"

    if host.lower() in ("localhost", "0.0.0.0", "0", "[::]", "::", "127.0.0.1"):
        return f"禁止访问本地地址: {host}"

    if host in _CLOUD_METADATA_IPS:
        return f"禁止访问云元数据端点: {host}"

    if _is_ip_blocked(host):
        return f"禁止访问内网/回环地址: {host}"

    try:
        for info in socket.getaddrinfo(host, None, 0, socket.SOCK_STREAM):
            addr_str = info[4][0]
            if addr_str in _CLOUD_METADATA_IPS:
                return f"禁止访问云元数据端点: {addr_str} (由 {host} 解析)"
            if _is_ip_blocked(addr_str):
                return f"禁止访问内网/回环地址: {addr_str} (由 {host} 解析)"
    except socket.gaierror:
        return f"无法解析域名: {host}"

    return None


# ---- 命令安全 ----

_DANGEROUS_COMMANDS: set[str] = {
    "rm", "rmdir", "del", "deltree",
    "shutdown", "reboot", "halt", "poweroff", "init", "systemctl",
    "sudo", "su", "pkexec", "doas",
    "chmod", "chown", "chgrp", "chattr", "cacls", "icacls",
    "mkfs", "mkfs.ext4", "mkfs.ntfs", "mkfs.vfat",
    "dd", "fdisk", "parted", "format",
    "iptables", "nftables", "ufw", "firewall-cmd", "netsh",
    "killall", "pkill",
}

_DANGEROUS_PATTERNS: list[tuple[_re.Pattern, str]] = [
    (_re.compile(r'\brm\s+.*-rf\b'), "禁止 rm -rf (递归强制删除)"),
    (_re.compile(r'\brm\s+.*-r\s+/'), "禁止递归删除根目录"),
    (_re.compile(r'\bdd\s+if='), "禁止 dd 磁盘操作"),
    (_re.compile(r'>\s*/dev/sd'), "禁止重定向写入块设备"),
    (_re.compile(r'mkfs\.'), "禁止格式化文件系统"),
    (_re.compile(r':\(\)\s*\{'), "禁止 fork 炸弹模式"),
    (_re.compile(r'\bformat\s+[a-zA-Z]:'), "禁止 Windows 格式化磁盘"),
    (_re.compile(r'\bdel\s+/[fq].*[A-Z]:\\'), "禁止 Windows 强制删除系统文件"),
]

_ENV_ALLOWLIST: set[str] = {
    "PATH", "HOME", "USER", "USERNAME", "USERPROFILE",
    "TEMP", "TMP", "TMPDIR",
    "LANG", "LC_ALL", "LC_CTYPE", "LANGUAGE",
    "TERM", "COLORTERM", "DISPLAY", "WAYLAND_DISPLAY",
    "SHELL", "PWD", "OLDPWD",
    "SYSTEMROOT", "SystemRoot", "WINDIR", "windir",
    "ProgramFiles", "ProgramFiles(x86)",
    "CommonProgramFiles", "CommonProgramFiles(x86)",
    "ProgramData", "ALLUSERSPROFILE", "PUBLIC",
    "COMSPEC", "PATHEXT", "OS",
    "CUDA_VISIBLE_DEVICES", "CUDA_PATH",
    "VIRTUAL_ENV", "CONDA_PREFIX", "CONDA_DEFAULT_ENV",
    "VOTX_USER_DIR",
}


def check_dangerous_command(command: str) -> str | None:
    import shlex
    cmd_stripped = command.strip()
    try:
        tokens = shlex.split(cmd_stripped)
        if tokens:
            base_cmd = os.path.basename(tokens[0]).lower()
            if base_cmd in _DANGEROUS_COMMANDS:
                return f"禁止执行危险命令: {base_cmd}"
    except ValueError:
        pass

    for pattern, msg in _DANGEROUS_PATTERNS:
        if pattern.search(command):
            return msg

    return None


def safe_working_dir(working_dir: str) -> str | None:
    if not working_dir or not working_dir.strip():
        return None
    p = safe_path(working_dir)
    if p is None:
        return f"无效的工作目录: {working_dir}"
    if not p.exists():
        return f"工作目录不存在: {p}"
    if not p.is_dir():
        return f"工作目录不是目录: {p}"
    if check_sandbox(p) is None:
        return f"工作目录越权: {p}"
    return None


def sanitize_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for key, val in os.environ.items():
        upper = key.upper()
        if any(s in upper for s in ("API_KEY", "TOKEN", "SECRET", "PASSWORD", "AUTH", "CREDENTIAL")):
            continue
        if key in _ENV_ALLOWLIST:
            env[key] = val
        elif key.startswith(("VOTX_", "CONDA_", "VIRTUAL_")):
            env[key] = val
        elif key in ("CC", "CXX", "MAKEFLAGS", "PKG_CONFIG_PATH"):
            env[key] = val
    return env


def _fmt_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    elif n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    else:
        return f"{n / 1024 / 1024:.1f} MB"
