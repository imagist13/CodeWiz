from pathlib import Path
from typing import Optional


def parse_document(file_path: Path) -> str:
    suffix = file_path.suffix.lower()

    if suffix == ".pdf":
        return _parse_pdf(file_path)
    elif suffix == ".docx":
        return _parse_docx(file_path)
    elif suffix in (".txt", ".md", ".json", ".py", ".ts", ".js", ".yaml", ".yml"):
        return _parse_text(file_path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def _parse_pdf(file_path: Path) -> str:
    from pypdf import PdfReader
    reader = PdfReader(str(file_path))
    texts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            texts.append(text)
    return "\n\n".join(texts)


def _parse_docx(file_path: Path) -> str:
    from docx import Document
    doc = Document(str(file_path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def _parse_text(file_path: Path) -> str:
    return file_path.read_text(encoding="utf-8", errors="ignore")


def get_file_type(filename: str) -> Optional[str]:
    suffix = Path(filename).suffix.lower()
    mapping = {
        ".pdf": "pdf",
        ".docx": "docx",
        ".txt": "txt",
        ".md": "md",
    }
    return mapping.get(suffix)
