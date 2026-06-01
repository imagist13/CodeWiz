import uuid
from pathlib import Path

from app.db.database import get_connection
from app.services.rag.parser import parse_document
from app.services.rag.segmenter import split_text
from app.services.rag.bailian_client import get_bailian_client
from app.services.rag.milvus_client import delete_vectors_by_doc_id, insert_vectors
from app.services.settings_service import get_enabled_models

DATA_DIR = Path("./data")
UPLOAD_DIR = DATA_DIR / "rag_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _update_doc_status(doc_id: str, status: str, error_msg: str = None, chunk_count: int = None):
    conn = get_connection()
    cursor = conn.cursor()
    fields = ["status = ?", "updated_at = datetime('now')"]
    values = [status]
    if error_msg is not None:
        fields.append("error_msg = ?")
        values.append(error_msg)
    if chunk_count is not None:
        fields.append("chunk_count = ?")
        values.append(chunk_count)
    values.append(doc_id)
    cursor.execute(
        f"UPDATE rag_documents SET {', '.join(fields)} WHERE id = ?",
        values,
    )
    conn.commit()
    conn.close()


def process_document(doc_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rag_documents WHERE id = ?", (doc_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return

    doc = dict(row)
    user_id = doc.get("user_id") or None

    enabled = get_enabled_models(user_id)
    if not enabled.get("embedding"):
        _update_doc_status(doc_id, "failed", error_msg="Embedding 模型未启用，请先配置并启用")
        return
    file_path = Path(doc["file_path"])
    chunk_size = doc["chunk_size"] or 500
    chunk_overlap = doc["chunk_overlap"] or 50
    smart_split = bool(doc["smart_split"])
    domain_id = doc.get("domain_id", "default")
    user_id = doc.get("user_id") or None

    try:
        # Step 1: Parsing
        _update_doc_status(doc_id, "parsing")
        raw_text = parse_document(file_path)

        # Step 2: Segmentation
        _update_doc_status(doc_id, "segmenting")
        chunks = split_text(raw_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap, smart_split=smart_split)
        if not chunks:
            _update_doc_status(doc_id, "failed", error_msg="No text content extracted")
            return

        # Step 3: Embedding
        _update_doc_status(doc_id, "embedding")
        # Delete old vectors if retraining
        delete_vectors_by_doc_id(doc_id, domain_id=domain_id, user_id=user_id)

        client = get_bailian_client(user_id)
        embeddings = client.embed_texts(chunks)

        records = []
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            records.append({
                "id": f"{doc_id}_{i}",
                "doc_id": doc_id,
                "chunk_index": i,
                "content": chunk[:8000],
                "embedding": emb,
            })

        insert_vectors(records, domain_id=domain_id, user_id=user_id)
        _update_doc_status(doc_id, "ready", chunk_count=len(chunks))

    except Exception as e:
        _update_doc_status(doc_id, "failed", error_msg=str(e)[:500])
