"""Skills 公共工具 — 所有 Skill 共享的安全工具"""

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


# ---- 路径安全 ----

_BLOCKED_HOSTS = {
    "localhost", "127.0.0.1", "0.0.0.0",
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
    "169.254.169.254", "metadata.google.internal",
}


def safe_path(raw_path: str, base_dir: str | Path | None = None) -> Path:
    """安全解析相对路径"""
    if base_dir is None:
        from config import get_conduit_repo_path
        base_dir = get_conduit_repo_path()
    base = Path(base_dir).resolve()
    resolved = (base / raw_path.lstrip("/")).resolve()
    if not str(resolved).startswith(str(base)):
        raise ValueError(f"路径越界: {raw_path}")
    return resolved


def check_sandbox(path: str | Path, allowed_roots: list[str | Path] | None = None) -> bool:
    """检查路径是否在沙箱内"""
    if allowed_roots is None:
        from config import get_conduit_repo_path
        allowed_roots = [get_conduit_repo_path()]
    p = Path(path).resolve()
    for root in allowed_roots:
        if str(p).startswith(str(Path(root).resolve())):
            return True
    return False


# ---- SSRF 防护 ----

def validate_url(url: str) -> str:
    """验证 URL 安全，返回原始 URL 或抛出异常"""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"不允许的协议: {parsed.scheme}")
        host = parsed.hostname or ""
        if host in _BLOCKED_HOSTS:
            raise ValueError(f"不允许的 host: {host}")
        # 简单数字 IP 检查
        if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host):
            if host.startswith(("10.", "127.", "192.168.", "0.")):
                raise ValueError(f"不允许的 IP: {host}")
            first = int(host.split(".")[0])
            if 224 <= first <= 255:
                raise ValueError(f"不允许的 IP 段: {host}")
        return url
    except Exception:
        raise ValueError(f"URL 安全验证失败: {url}")


# ---- 命令安全 ----

_DANGEROUS_PATTERNS = [
    r"\brm\s+-rf\b", r"\brmdir\b", r"\bdel\b",
    r"\bshutdown\b", r"\breboot\b", r"\bmkfs\b",
    r"\bdd\b", r"\bfdisk\b", r"\bsudo\b",
    r"\bsu\s", r"\bpkexec\b",
]


def check_dangerous_command(command: str) -> str | None:
    """检查命令是否危险，返回 None 表示安全，字符串表示错误信息"""
    for pattern in _DANGEROUS_PATTERNS:
        if re.search(pattern, command):
            return f"危险命令模式: {pattern}"
    return None


# ---- 错误工具 ----

def err(msg: str) -> str:
    return f"[ERROR] {msg}"


def truncate(text: str, max_len: int = 2000) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"\n... (已截断，共 {len(text)} 字符)"


# ---- 日志工具 ----

def log_tool_call(
    name: str,
    args: dict,
    result: str,
    success: bool,
    elapsed_ms: int,
    user_dir: str,
) -> None:
    """记录工具调用到 JSONL"""
    import json
    from datetime import datetime, timezone

    log_dir = Path(user_dir) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "tool_log.jsonl"

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "tool": name,
        "args": args,
        "success": success,
        "elapsed_ms": elapsed_ms,
        "result_preview": str(result)[:200],
    }
    fd, tmp = tempfile.mkstemp(dir=str(log_dir), prefix=".tmp-", suffix=".jsonl")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, log_file)
    except Exception:
        pass


import tempfile
