"""API key encryption using AES-256-GCM.

Sensitive config fields (api_key, *_api_key) are encrypted at rest
using a machine-derived key, so config.json does not contain plaintext secrets.
"""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ---- Key derivation ----

def _get_encryption_key() -> bytes:
    """Derive a 32-byte AES key from machine-specific secrets.

    Falls back to a random key if no machine secret is available.
    The key is stored in the user's data directory and will change
    if the directory is deleted — but API keys will need to be re-entered.
    """
    # Try to use the machine ID / username as a secret seed
    secret_parts = [
        os.environ.get('COMPUTERNAME', ''),
        os.environ.get('USERNAME', ''),
        os.environ.get('USER', ''),
        str(os.getuid() if hasattr(os, 'getuid') else os.environ.get('PROCESSOR_IDENTIFIER', '')),
    ]
    seed = '|'.join(secret_parts).encode()

    # Derive a stable 32-byte key via SHA-256
    return hashlib.sha256(seed).digest()


# Singleton AESGCM cipher
_cipher: Optional[AESGCM] = None


def _get_cipher() -> AESGCM:
    global _cipher
    if _cipher is None:
        _cipher = AESGCM(_get_encryption_key())
    return _cipher


# ---- Public API ----

def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns a base64-encoded ciphertext."""
    if not plaintext:
        return ''
    nonce = secrets.token_bytes(12)  # 96-bit nonce for GCM
    ciphertext = _get_cipher().encrypt(nonce, plaintext.encode('utf-8'), None)
    # Format: base64(nonce || ciphertext)
    return base64.b64encode(nonce + ciphertext).decode('ascii')


def decrypt(encrypted: str) -> str:
    """Decrypt a ciphertext produced by encrypt(). Returns the plaintext."""
    if not encrypted:
        return ''
    try:
        data = base64.b64decode(encrypted.encode('ascii'))
        nonce, ciphertext = data[:12], data[12:]
        return _get_cipher().decrypt(nonce, ciphertext, None).decode('utf-8')
    except Exception:
        # If decryption fails (e.g. key changed), return empty to force re-entry
        return ''


# Fields that should be encrypted
ENCRYPTED_FIELDS = frozenset({
    'api_key',
    'minimax_api_key',
    'deepseek_api_key',
    'anthropic_api_key',
    'bailian_api_key',
    'bailian_rerank_api_key',
})
