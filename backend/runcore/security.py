from __future__ import annotations

"""Security policy and sandbox utilities."""
import os
import re
import threading
from typing import Optional
from paths import get_user_dir

# Thread-local storage for workspace root (set per-request)
_local = threading.local()


def set_workspace_root(path: Optional[str]) -> None:
    """Set the workspace root for the current thread/request."""
    _local.workspace_root = path


def get_workspace_root() -> Optional[str]:
    """Get the workspace root for the current thread/request."""
    return getattr(_local, 'workspace_root', None)


# Dangerous command patterns (Windows-aware)
DANGEROUS_PATTERNS = [
    r'rm\s+-rf\s+/', r'rm\s+-rf\s+\*', r'dd\s+if=.*of=/dev/', r'mkfs\.', r':\(\)\{:|:&\}',  # fork bomb
    r'curl\s+.*\|\s*sh', r'wget\s+.*\|\s*sh',
    r'>\s*/etc/', r'>\s*/var/', r'>\s*~/',  # overwrite protected dirs
]

# Private IP ranges to block
PRIVATE_IP_PATTERNS = [
    r'^10\.', r'^172\.(1[6-9]|2[0-9]|3[01])\.', r'^192\.168\.',
    r'^127\.', r'^localhost', r'^0\.', r'^169\.254\.',
    r'^169\.\d+\.',  # link-local
]

ALLOWED_EXTENSIONS = {
    'read': ['.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml',
             '.toml', '.ini', '.cfg', '.conf', '.sh', '.bat', '.ps1', '.css', '.html',
             '.xml', '.sql', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
             '.rb', '.php', '.swift', '.kt', '.kts', '.vue', '.svelte', '.dart',
             '.ex', '.exs', '.erl', '.hs', '.scala', '.r', '.lua', '.pl', '.sh'],
    'write': ['.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml',
              '.toml', '.ini', '.cfg', '.conf', '.sh', '.bat', '.ps1', '.css', '.html',
              '.xml', '.sql', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs'],
}


def check_command_safety(command: str, username: str) -> tuple[bool, Optional[str]]:
    """Check if a shell command is safe. Returns (safe, reason)."""
    cmd_lower = command.lower()

    # Check dangerous patterns
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, cmd_lower, re.IGNORECASE):
            return False, f"Dangerous command pattern blocked: {pattern}"

    # Check private IP access
    for pattern in PRIVATE_IP_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return False, f"Private/internal IP access blocked"

    return True, None


def safe_path(username: str, requested_path: str, workspace_root: Optional[str] = None) -> str:
    """Resolve a path within a sandbox directory (user home or workspace root).

    When workspace_root is set (e.g. the project root like "D:\\桌面\\cdfg"),
    all paths resolve from there instead of the sandbox user_dir. This lets
    tools operate on the actual project the user is working on.

    Handles:
    - "." -> base dir (workspace_root or user_dir)
    - "./foo" -> base dir / foo
    - "foo" -> base dir / foo
    - "/foo" (Unix) or "C:/foo" (Windows absolute) -> rebased under base dir
    - absolute paths are rebased under base dir

    Defense against symlink attacks:
    - The prefix check MUST be done on the normalized path BEFORE realpath,
      because realpath resolves through symlinks (e.g. user_dir could link to /etc).
    - We use normpath + startswith to guarantee containment without following links.
    """
    base_dir = get_workspace_root() or workspace_root or get_user_dir(username)
    requested_path = requested_path.replace('\\', '/').strip()

    # "." means base dir
    if requested_path in ('.', '', '/'):
        return os.path.normpath(base_dir)

    # Normalize first so Windows backslash paths become forward-slash paths,
    # allowing the subsequent absolute-path checks to work correctly.
    requested_path = os.path.normpath(requested_path)

    # Already an absolute path (Windows C:/... or Unix /...) — use it directly
    if len(requested_path) > 1 and requested_path[1] == ':':
        resolved = requested_path
    elif requested_path.startswith('/'):
        resolved = requested_path
    else:
        # Relative path — resolve from base_dir
        resolved = os.path.normpath(os.path.join(base_dir, requested_path))

    # Defense: ensure resolved path stays within base_dir
    base_dir_abs = os.path.abspath(base_dir)
    try:
        common = os.path.commonpath([base_dir_abs, resolved])
        if os.path.normcase(common) != os.path.normcase(base_dir_abs):
            raise PermissionError(f"Access denied: {requested_path} is outside directory: {base_dir}")
    except ValueError:
        # commonpath raises ValueError on incompatible paths (e.g. C:\ vs D:\)
        raise PermissionError(f"Access denied: {requested_path} is outside directory: {base_dir}")

    # Now realpath is safe to call — used only for the final canonical path
    try:
        real_resolved = os.path.realpath(resolved)
        common2 = os.path.commonpath([base_dir_abs, real_resolved])
        if os.path.normcase(common2) != os.path.normcase(base_dir_abs):
            raise PermissionError(f"Access denied: {requested_path} traverses a symlink outside directory")
    except ValueError:
        raise PermissionError(f"Access denied: {requested_path} is outside directory: {base_dir}")

    return resolved


def check_extension(path: str, operation: str) -> bool:
    """Check if file extension is allowed for the operation."""
    _, ext = os.path.splitext(path.lower())
    return ext in ALLOWED_EXTENSIONS.get(operation, [])
