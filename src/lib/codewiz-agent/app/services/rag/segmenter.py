import re
from typing import List


def split_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50, smart_split: bool = True) -> List[str]:
    if not text:
        return []

    if smart_split:
        chunks = _smart_split(text, chunk_size, chunk_overlap)
    else:
        chunks = _fixed_split(text, chunk_size, chunk_overlap)

    return [c.strip() for c in chunks if c.strip()]


def _smart_split(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    # First split by headings and paragraphs
    # Match markdown headings, common heading patterns, or double newlines
    pattern = r"(\n#{1,6}\s+.*?\n|\n[A-Z][A-Z\s]{2,}\n|\n\n+)"
    parts = re.split(pattern, text)
    parts = [p for p in parts if p.strip()]

    chunks = []
    current_chunk = ""

    for part in parts:
        part_len = len(part)
        if part_len > chunk_size:
            # Oversized part: flush current chunk first
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = ""
            # Then split the oversized part with fixed length
            sub_chunks = _fixed_split(part, chunk_size, chunk_overlap)
            chunks.extend(sub_chunks)
        else:
            if len(current_chunk) + part_len + 1 <= chunk_size:
                current_chunk = (current_chunk + "\n\n" + part).strip() if current_chunk else part
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = part

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def _fixed_split(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    chunks = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = text[start:end]
        chunks.append(chunk)
        start += chunk_size - chunk_overlap
        if start >= end:
            break
    return chunks
