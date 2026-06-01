"""
Legacy tool implementations — bash, read_file, write_file, list_dir, delete_file, search_files.

DEPRECATED: These tools are kept for backward compatibility only.
New code should use file_ops.py (unified file operations) and search.py (search).

These tools still return dict-style results (converted to ToolResult by
dict_to_result() in the registry). The dict return is the only thing
keeping them backward-compatible with existing skill code.

All paths route through safe_path() so workspace sandboxing is enforced.
"""
from __future__ import annotations

import copy
import logging
import os
import re
import shutil
import subprocess
import sys
from typing import Optional

from runcore.tools.base import ToolResult
from runcore.security import check_command_safety, safe_path, check_extension

log = logging.getLogger(__name__)


# ============================
# Helpers
# ============================

def _safe_result(ok: bool, content: str = '', error: str = '', **kwargs) -> dict:
    """Build a legacy-style success/error dict (DEPRECATED — use ToolResult)."""
    result = {'success': ok}
    if error:
        result['error'] = error
    if content:
        result['content'] = content
        result['output'] = content
    result.update(kwargs)
    return result


# ============================
# Bash tool
# ============================

def bash_tool(command: str, cwd: Optional[str] = None, username: str = '') -> dict:
    safe, reason = check_command_safety(command, username or 'default')
    if not safe:
        return _safe_result(False, error=reason)

    username = username or 'default'
    work_dir = safe_path(username, cwd) if cwd else safe_path(username, '.')

    env = copy.deepcopy(os.environ)

    if sys.platform == 'win32':
        # Wrap in powershell so we get the full user PATH (includes npm, node, etc.)
        cmd_str = f'chcp 65001 >nul & powershell -NoProfile -ExecutionPolicy Bypass -Command "{command}"'
    else:
        cmd_str = command

    try:
        result = subprocess.run(
            cmd_str,
            shell=True,
            cwd=work_dir,
            capture_output=True,
            timeout=120,
            env=env,
        )
        stdout = result.stdout.decode('utf-8', errors='replace')[:10000]
        stderr = result.stderr.decode('utf-8', errors='replace')[:2000]
        output = stdout or stderr or f'(exit={result.returncode})'
        return _safe_result(
            result.returncode == 0,
            output,
            stdout=stdout,
            stderr=stderr,
            returncode=result.returncode,
        )
    except subprocess.TimeoutExpired:
        return _safe_result(False, error='Command timed out after 120s')
    except Exception as e:
        return _safe_result(False, error=str(e))


# ============================
# Read File tool
# ============================

def read_file_tool(path: str, lines: int = 500, username: str = '') -> dict:
    try:
        if not check_extension(path, 'read'):
            return _safe_result(False, error=f'File extension not allowed for read: {path}')
        full_path = safe_path(username or 'default', path)
        with open(full_path, encoding='utf-8', errors='replace') as f:
            content = ''.join(f.readlines()[:lines])
        return _safe_result(True, content, path=full_path)
    except Exception as e:
        return _safe_result(False, error=str(e))


# ============================
# Write File tool
# ============================

def write_file_tool(path: str, content: str, append: bool = False, username: str = '') -> dict:
    try:
        if not check_extension(path, 'write'):
            return _safe_result(False, error=f'File extension not allowed for write: {path}')
        full_path = safe_path(username or 'default', path)
        mode = 'a' if append else 'w'
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, mode, encoding='utf-8') as f:
            f.write(content)
        return _safe_result(True, path=full_path, bytes=len(content))
    except Exception as e:
        return _safe_result(False, error=str(e))


# ============================
# List Dir tool
# ============================

def list_dir_tool(path: str = '.', recursive: bool = False, username: str = '') -> dict:
    try:
        full_path = safe_path(username or 'default', path)
        entries = []
        if recursive:
            from runcore.tools.base import SKIP_DIRS
            for root, dirs, files in os.walk(full_path):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                for name in sorted(dirs + files):
                    rel = os.path.relpath(os.path.join(root, name), full_path)
                    entries.append(rel)
        else:
            for name in sorted(os.listdir(full_path)):
                entries.append(name)
        return _safe_result(True, entries=entries[:500], path=full_path)
    except Exception as e:
        return _safe_result(False, error=str(e))


# ============================
# Delete File tool
# ============================

def delete_file_tool(path: str, username: str = '') -> dict:
    try:
        full_path = safe_path(username or 'default', path)
        if os.path.isfile(full_path):
            os.remove(full_path)
        elif os.path.isdir(full_path):
            shutil.rmtree(full_path)
        return _safe_result(True, path=full_path)
    except Exception as e:
        return _safe_result(False, error=str(e))


# ============================
# Search Files tool
# ============================

def search_files_tool(
    path: str = '.',
    pattern: str = '',
    file_pattern: str = '*',
    max_results: int = 50,
    username: str = ''
) -> dict:
    try:
        full_path = safe_path(username or 'default', path)
        regex = re.compile(pattern)
        matches = []
        count = 0
        for root, dirs, files in os.walk(full_path):
            if count >= max_results:
                break
            for fname in files:
                if not re.match(file_pattern.replace('*', '.*'), fname):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, encoding='utf-8', errors='replace') as f:
                        for lineno, line in enumerate(f, 1):
                            if regex.search(line):
                                matches.append({
                                    'file': os.path.relpath(fpath, full_path),
                                    'line': lineno,
                                    'content': line.rstrip(),
                                })
                                count += 1
                                if count >= max_results:
                                    break
                except Exception:
                    continue
        return _safe_result(True, matches=matches)
    except Exception as e:
        return _safe_result(False, error=str(e))


# ============================
# Register all legacy tools into the registry
# ============================

def register_all_legacy_tools() -> None:
    """Register all legacy tools with parameter aliases for LLM compatibility.

    Aliases map the names LLMs commonly generate (e.g. file_path, file_content)
    to the canonical parameter names the handlers expect (path, content).
    """
    from runcore.tools.registry import get_registry

    registry = get_registry()

    # Bash — no path alias needed (uses 'command', 'cwd')
    registry.register_legacy(
        name='bash',
        handler=bash_tool,
        description='Execute a bash/shell command',
        per_round_limit=30,
    )

    # Read file — LLM may send file_path / file / path / fileName
    registry.register_legacy(
        name='read_file',
        handler=read_file_tool,
        description='Read contents of a file',
        param_aliases={
            'file_path': 'path',
            'file': 'path',
            'fileName': 'path',
            'file_name': 'path',
        },
    )

    # Write file — LLM may send file_content / content / file_path / text
    registry.register_legacy(
        name='write_file',
        handler=write_file_tool,
        description='Write content to a file',
        param_aliases={
            'file_path': 'path',
            'file': 'path',
            'fileName': 'path',
            'file_name': 'path',
            'file_content': 'content',
            'text': 'content',
        },
    )

    # List directory — LLM may send file_path / directory / path / folder
    registry.register_legacy(
        name='list_dir',
        handler=list_dir_tool,
        description='List files in a directory',
        param_aliases={
            'file_path': 'path',
            'directory': 'path',
            'folder': 'path',
            'dir': 'path',
        },
    )

    # Delete file — LLM may send file_path / file / path / target
    registry.register_legacy(
        name='delete_file',
        handler=delete_file_tool,
        description='Delete a file or directory',
        param_aliases={
            'file_path': 'path',
            'file': 'path',
            'fileName': 'path',
            'target': 'path',
        },
    )

    # Search files — LLM may send file_path / pattern / search_term / query
    registry.register_legacy(
        name='search_files',
        handler=search_files_tool,
        description='Search for text in files using regex',
        param_aliases={
            'file_path': 'path',
            'search_term': 'pattern',
            'query': 'pattern',
            'file_pattern': 'file_pattern',
        },
    )

    log.info(f"Registered {len(registry.list_tools())} total tools after legacy registration")


# Legacy tools are registered explicitly via legacy_tools.register_all_legacy_tools(),
# called from main.py after the registry is initialized.
# Do NOT auto-register here — it causes import-order side effects.
