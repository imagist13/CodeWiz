from __future__ import annotations

"""Files API for user file operations."""
import os
import uuid
import hashlib

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse

from paths import get_user_dir, ensure_dir
from runcore.security import safe_path

router = APIRouter()

ALLOWED_EXTENSIONS = {
    '.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml',
    '.toml', '.ini', '.cfg', '.conf', '.sh', '.bat', '.ps1', '.css', '.html',
    '.xml', '.sql', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
    '.rb', '.php', '.swift', '.kt', '.kts', '.vue', '.svelte', '.dart',
    '.ex', '.exs', '.erl', '.hs', '.scala', '.r', '.lua', '.pl',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
    '.pdf', '.zip', '.tar', '.gz'
}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


@router.get('/files')
async def list_files(
    path: str = Query(default='.'),
    username: str = Query(...),
):
    """List files in user's directory."""
    try:
        user_dir = get_user_dir(username)
        full_path = safe_path(username, path)

        entries = []
        for name in sorted(os.listdir(full_path)):
            fpath = os.path.join(full_path, name)
            stat = os.stat(fpath)
            entries.append({
                'name': name,
                'type': 'dir' if os.path.isdir(fpath) else 'file',
                'size': stat.st_size,
                'mtime': stat.st_mtime
            })
        return {'entries': entries, 'path': full_path}
    except Exception as e:
        return {'entries': [], 'error': str(e)}


@router.post('/files/upload')
async def upload_file(
    username: str = Query(...),
):
    """Upload a file to user's directory (handled via multipart)."""
    return {'error': 'Use POST with multipart/form-data to upload files'}


@router.get('/files/download/{filename}')
async def download_file(
    filename: str,
    username: str = Query(...),
):
    """Download a file."""
    try:
        safe_filepath = safe_path(username, filename)
        if not os.path.isfile(safe_filepath):
            raise HTTPException(404, 'File not found')
        return FileResponse(safe_filepath, filename=filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete('/files')
async def delete_file(
    path: str = Query(...),
    username: str = Query(...),
):
    """Delete a file or directory."""
    try:
        full_path = safe_path(username, path)
        if os.path.isfile(full_path):
            os.remove(full_path)
        elif os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)
        return {'deleted': True}
    except Exception as e:
        raise HTTPException(500, str(e))
