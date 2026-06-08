from typing import List, Optional

from pymilvus import MilvusClient, DataType

from app.core.config import get_settings

COLLECTION_PREFIX = "rag_domain_"
EMBEDDING_DIM = 1536

_milvus_clients: dict = {}


def get_milvus_client(user_id: Optional[str] = None) -> MilvusClient:
    settings = get_settings(user_id)
    uri = f"http://{settings.milvus_host}:{settings.milvus_port}"

    if uri not in _milvus_clients:
        _milvus_clients[uri] = MilvusClient(uri=uri)
    return _milvus_clients[uri]


def _collection_name(domain_id: str) -> str:
    # Milvus collection names can only contain numbers, letters, and underscores
    safe_id = domain_id.replace("-", "")
    return f"{COLLECTION_PREFIX}{safe_id}"


def _init_collection(client: MilvusClient, collection_name: str):
    if client.has_collection(collection_name):
        return

    schema = client.create_schema(
        auto_id=False,
        enable_dynamic_field=False,
    )
    schema.add_field("id", DataType.VARCHAR, max_length=64, is_primary=True)
    schema.add_field("doc_id", DataType.VARCHAR, max_length=64)
    schema.add_field("chunk_index", DataType.INT64)
    schema.add_field("content", DataType.VARCHAR, max_length=8192)
    schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM)

    index_params = client.prepare_index_params()
    index_params.add_index(
        field_name="embedding",
        index_type="HNSW",
        metric_type="COSINE",
        params={"M": 16, "efConstruction": 200},
    )

    client.create_collection(
        collection_name=collection_name,
        schema=schema,
        index_params=index_params,
    )


def init_domain_collection(domain_id: str, user_id: Optional[str] = None):
    client = get_milvus_client(user_id)
    _init_collection(client, _collection_name(domain_id))


def init_milvus_collection(user_id: Optional[str] = None):
    """Initialize the default domain collection for backward compatibility."""
    init_domain_collection("default", user_id=user_id)


def drop_domain_collection(domain_id: str, user_id: Optional[str] = None):
    client = get_milvus_client(user_id)
    collection_name = _collection_name(domain_id)
    if client.has_collection(collection_name):
        client.drop_collection(collection_name)


def delete_vectors_by_doc_id(doc_id: str, domain_id: str = "default", user_id: Optional[str] = None):
    client = get_milvus_client(user_id)
    collection_name = _collection_name(domain_id)
    if not client.has_collection(collection_name):
        return
    client.delete(
        collection_name=collection_name,
        filter=f'doc_id == "{doc_id}"',
    )


def insert_vectors(records: List[dict], domain_id: str = "default", user_id: Optional[str] = None):
    client = get_milvus_client(user_id)
    collection_name = _collection_name(domain_id)
    _init_collection(client, collection_name)
    client.insert(collection_name=collection_name, data=records)


def search_vectors(embedding: List[float], top_k: int = 20, domain_id: str = "default", user_id: Optional[str] = None) -> List[dict]:
    client = get_milvus_client(user_id)
    collection_name = _collection_name(domain_id)
    if not client.has_collection(collection_name):
        return []
    results = client.search(
        collection_name=collection_name,
        data=[embedding],
        limit=top_k,
        output_fields=["doc_id", "chunk_index", "content"],
    )
    hits = []
    for r in results[0]:
        hits.append({
            "id": r["id"],
            "doc_id": r["entity"]["doc_id"],
            "chunk_index": r["entity"]["chunk_index"],
            "content": r["entity"]["content"],
            "distance": r["distance"],
        })
    return hits


def get_chunks_by_doc_id(doc_id: str, domain_id: str = "default", user_id: Optional[str] = None) -> List[dict]:
    client = get_milvus_client(user_id)
    collection_name = _collection_name(domain_id)
    if not client.has_collection(collection_name):
        return []
    results = client.query(
        collection_name=collection_name,
        filter=f'doc_id == "{doc_id}"',
        output_fields=["id", "chunk_index", "content"],
    )
    return sorted(results, key=lambda x: x.get("chunk_index", 0))


def get_collection_stats(domain_id: str = "default", user_id: Optional[str] = None) -> dict:
    client = get_milvus_client(user_id)
    collection_name = _collection_name(domain_id)
    if not client.has_collection(collection_name):
        return {"doc_count": 0}
    stats = client.get_collection_stats(collection_name)
    return {"doc_count": stats.get("row_count", 0)}


def list_domain_collections(user_id: Optional[str] = None) -> List[str]:
    client = get_milvus_client(user_id)
    collections = client.list_collections()
    return [c for c in collections if c.startswith(COLLECTION_PREFIX)]
