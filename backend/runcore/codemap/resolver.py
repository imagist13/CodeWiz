from __future__ import annotations

"""Codemap resolver - DSL to file paths."""
import os
import re
from pathlib import Path
from typing import Any


def resolve_pattern(pattern: str, root_path: str) -> list[str]:
    """Resolve a codemap pattern to file paths.

    Patterns:
      - `ext:py` -> all Python files
      - `name:foo` -> files with 'foo' in name
      - `path:src/utils` -> files under src/utils
      - `lang:go` -> Go files
      - `!pattern` -> exclude
    """
    results = []
    skip_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv',
                 'dist', 'build', '.next', 'target'}

    negative = pattern.startswith('!')
    search = pattern.lstrip('!')

    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]

        for fname in filenames:
            if _matches(fname, dirpath, search):
                full = os.path.join(dirpath, fname)
                rel = os.path.relpath(full, root_path).replace('\\', '/')
                if negative:
                    results = [r for r in results if r != rel]
                else:
                    results.append(rel)

    return results


def _matches(fname: str, dirpath: str, pattern: str) -> bool:
    if pattern.startswith('ext:'):
        ext = pattern[4:]
        return fname.endswith(f'.{ext}')
    if pattern.startswith('name:'):
        name = pattern[5:]
        return name in fname
    if pattern.startswith('path:'):
        subpath = pattern[5:]
        return subpath in dirpath
    if pattern.startswith('lang:'):
        lang = pattern[5:]
        lang_map = {'go': '.go', 'py': '.py', 'js': '.js', 'ts': '.ts', 'rs': '.rs'}
        ext = lang_map.get(lang, f'.{lang}')
        return fname.endswith(ext)
    return pattern in fname
