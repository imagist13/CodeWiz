"""上下文召回 API"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from rag import ConduitRetriever
from config import get_conduit_repo_path


router = APIRouter()


class RetrieveRequest(BaseModel):
    query: str
    scope: str = "all"


@router.post("/context/retrieve")
async def retrieve(request: RetrieveRequest):
    """混合召回相关上下文"""
    try:
        retriever = ConduitRetriever(get_conduit_repo_path())
        result = retriever.retrieve(request.query, request.scope)

        return {
            "files": [
                {
                    "path": f.path,
                    "summary": f.summary,
                    "keywords": f.keywords,
                    "lines": f.lines,
                    "tokens": f.tokens,
                }
                for f in result.files
            ],
            "summary": result.summary,
            "tokens_est": result.tokens_est,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/context/reindex")
async def reindex():
    """重建索引"""
    try:
        from rag import FileIndex, CodeGraph
        repo_path = get_conduit_repo_path()

        fi = FileIndex(repo_path)
        count = fi.build()
        fi.save()

        cg = CodeGraph(repo_path)
        cg.build()
        cg.save()

        return {"ok": True, "files_indexed": count, "code_graph_built": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
