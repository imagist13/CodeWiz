from typing import List, Optional

from app.services.rag.milvus_client import search_vectors
from app.services.rag.bailian_client import get_bailian_client


MAX_CONTEXT_TOKENS = 4000


def assemble_context(chunks: List[dict], doc_names: Optional[dict] = None) -> str:
    context_parts = []
    total_len = 0
    for i, chunk in enumerate(chunks, start=1):
        text = chunk.get("content", "")
        doc_id = chunk.get("doc_id", "")
        filename = (doc_names or {}).get(doc_id, doc_id)
        part = f"[来源: {filename}] {text}"
        part_len = len(part)
        if total_len + part_len > MAX_CONTEXT_TOKENS * 4:  # rough char estimate
            break
        context_parts.append(part)
        total_len += part_len
    return "\n\n".join(context_parts)


async def retrieve(query: str, top_k: int = 20, rerank_top_n: int = 5, domain_id: str = "default", doc_names: Optional[dict] = None, user_id: Optional[str] = None) -> dict:
    client = get_bailian_client(user_id)
    try:
        query_embedding = client.embed_query(query)
    except Exception as e:
        return {"error": f"Embedding failed: {e}", "chunks": [], "context": ""}

    try:
        hits = search_vectors(query_embedding, top_k=top_k, domain_id=domain_id, user_id=user_id)
    except Exception as e:
        return {"error": f"Vector search failed: {e}", "chunks": [], "context": ""}

    if not hits:
        return {"chunks": [], "context": "", "warning": "No relevant documents found"}

    documents = [h["content"] for h in hits]

    try:
        reranked = client.rerank(query, documents, top_n=rerank_top_n)
        selected = []
        for r in reranked:
            idx = r["index"]
            if 0 <= idx < len(hits):
                chunk = hits[idx].copy()
                chunk["rerank_score"] = r["score"]
                selected.append(chunk)
    except Exception:
        # Fallback to top by vector similarity
        selected = hits[:rerank_top_n]

    context = assemble_context(selected, doc_names)
    return {"chunks": selected, "context": context}
