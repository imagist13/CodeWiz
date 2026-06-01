from __future__ import annotations

"""Codemap scanner - code structure indexing."""
import os
import hashlib
from pathlib import Path
from typing import Any

from runcore.tools.base import CODE_EXTENSIONS, SKIP_DIRS

LANGUAGE_EXTENSIONS = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.jsx': 'javascript', '.go': 'go', '.rs': 'rust', '.java': 'java',
    '.c': 'c', '.cpp': 'c', '.h': 'c', '.hpp': 'cpp',
    '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
    '.kt': 'kotlin', '.scala': 'scala', '.lua': 'lua', '.pl': 'perl',
    '.sql': 'sql', '.sh': 'bash', '.bat': 'batch', '.ps1': 'powershell',
    '.yaml': 'yaml', '.yml': 'yaml', '.json': 'json', '.toml': 'toml',
    '.xml': 'xml', '.html': 'html', '.css': 'css', '.vue': 'vue',
    '.svelte': 'svelte', '.dart': 'dart', '.swift': 'swift',
    '.ex': 'elixir', '.exs': 'elixir', '.erl': 'erlang', '.hs': 'haskell',
    '.r': 'r', '.md': 'markdown', '.rst': 'rst',
}


def scan_directory(root_path: str, max_files: int = 5000) -> dict[str, Any]:
    """Scan a directory and build a code map."""
    files_found = []
    dirs_scanned = 0

    skip_dirs = SKIP_DIRS  # shared constant from runcore.tools.base

    for dirpath, dirnames, filenames in os.walk(root_path):
        if dirs_scanned > 1000:
            break
        # Prune skipped dirs
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]

        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in CODE_EXTENSIONS:
                continue
            fpath = os.path.join(dirpath, fname)
            try:
                stat = os.stat(fpath)
                rel = os.path.relpath(fpath, root_path)
                lang = LANGUAGE_EXTENSIONS.get(ext, 'text')
                files_found.append({
                    'path': rel.replace('\\', '/'),
                    'size': stat.st_size,
                    'lang': lang,
                    'hash': hashlib.md5(rel.encode()).hexdigest()[:8]
                })
                if len(files_found) >= max_files:
                    return {'files': files_found, 'truncated': True}
            except OSError:
                continue
        dirs_scanned += 1

    return {'files': files_found, 'truncated': False}


def read_file_snippet(path: str, start: int = 0, lines: int = 50) -> dict[str, Any]:
    """Read a snippet of a code file."""
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            all_lines = f.readlines()
        total = len(all_lines)
        snippet_lines = all_lines[start:start + lines]
        return {
            'success': True,
            'content': ''.join(snippet_lines),
            'total_lines': total,
            'start': start,
            'end': min(start + lines, total)
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}
