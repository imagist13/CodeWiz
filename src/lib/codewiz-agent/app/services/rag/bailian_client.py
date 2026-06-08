import time
from typing import List, Optional

import requests

from app.core.config import get_settings


class BailianClient:
    def __init__(self, user_id: Optional[str] = None):
        settings = get_settings(user_id)
        self.api_key = settings.bailian_api_key
        self.embedding_url = settings.bailian_embedding_url
        self.rerank_url = settings.bailian_rerank_url
        self.embedding_model = settings.bailian_embedding_model
        self.rerank_model = settings.bailian_rerank_model
        self.embedding_dim = settings.bailian_embedding_dim

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def embed_texts(self, texts: List[str], max_retries: int = 3) -> List[List[float]]:
        url = f"{self.embedding_url}/embeddings"
        payload = {
            "model": self.embedding_model,
            "input": texts,
            "dimensions": self.embedding_dim,
            "encoding_format": "float",
        }

        last_error = None
        for attempt in range(max_retries):
            try:
                resp = requests.post(url, headers=self._headers(), json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                embeddings = data.get("data", [])
                return [e["embedding"] for e in embeddings]
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    time.sleep(1 * (attempt + 1))
                continue

        raise RuntimeError(f"Embedding failed after {max_retries} retries: {last_error}")

    def embed_query(self, query: str) -> List[float]:
        results = self.embed_texts([query])
        return results[0]

    def rerank(self, query: str, documents: List[str], top_n: int = 5, max_retries: int = 3) -> List[dict]:
        url = self.rerank_url
        payload = {
            "model": self.rerank_model,
            "input": {
                "query": {"text": query},
                "documents": [{"text": d} for d in documents],
            },
            "parameters": {
                "top_n": top_n,
                "return_documents": True,
            },
        }

        last_error = None
        for attempt in range(max_retries):
            try:
                resp = requests.post(url, headers=self._headers(), json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                results = data.get("output", {}).get("results", [])
                return [
                    {
                        "index": r["index"],
                        "document": r.get("document", {}).get("text", documents[r["index"]]),
                        "score": r.get("relevance_score") or r.get("score", 0),
                    }
                    for r in results
                ]
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    time.sleep(1 * (attempt + 1))
                continue

        raise RuntimeError(f"Rerank failed after {max_retries} retries: {last_error}")


def get_bailian_client(user_id: Optional[str] = None) -> BailianClient:
    """Build a BailianClient bound to the given user's settings.

    Falls back to env defaults when user_id is None or the user has no overrides.
    """
    return BailianClient(user_id=user_id)
