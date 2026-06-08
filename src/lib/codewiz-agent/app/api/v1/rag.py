import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.db.database import get_connection, get_latest_summary, get_messages_after_summary
from app.services.rag.milvus_client import (
    delete_vectors_by_doc_id,
    get_collection_stats,
    get_chunks_by_doc_id,
    init_domain_collection,
    drop_domain_collection,
)
from app.services.rag.processor import process_document, UPLOAD_DIR
from app.services.rag.retriever import retrieve
from app.services.llm import get_llm
from app.services.context_compression import context_compression
from app.services.event_bus import EventBus, EventType, HarnessEvent
from app.services.settings_service import get_enabled_models
from app.core.security import get_current_user
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

router = APIRouter()

ALLOWED_TYPES = {"pdf", "docx", "txt", "md"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


class RetrainRequest(BaseModel):
    chunk_size: int = 500
    chunk_overlap: int = 50
    smart_split: bool = True


class TestRetrievalRequest(BaseModel):
    query: str
    top_k: int = 20
    rerank_top_n: int = 5


class RagChatRequest(BaseModel):
    message: str
    domain_id: Optional[str] = None
    session_id: Optional[str] = None


class CreateDomainRequest(BaseModel):
    name: str
    description: str = ""


# ---------- Domain APIs ----------

@router.get("/domains")
async def list_domains(current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rag_domains WHERE user_id = ? ORDER BY created_at DESC", (current_user["id"],))
    rows = cursor.fetchall()
    domains = []
    for r in rows:
        d = dict(r)
        cursor.execute("SELECT COUNT(*) as doc_count FROM rag_documents WHERE domain_id = ? AND user_id = ?", (d["id"], current_user["id"]))
        d["doc_count"] = cursor.fetchone()["doc_count"]
        domains.append(d)
    conn.close()
    return {"items": domains}


@router.post("/domains")
async def create_domain(request: CreateDomainRequest, current_user: dict = Depends(get_current_user)):
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Domain name is required")

    domain_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO rag_domains (id, name, description, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (domain_id, request.name.strip(), request.description.strip(), current_user["id"], now, now),
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=409, detail="领域名称已存在")
    conn.close()

    init_domain_collection(domain_id, user_id=current_user["id"])

    return {"id": domain_id, "name": request.name.strip(), "description": request.description.strip()}


@router.put("/domains/{domain_id}")
async def update_domain(domain_id: str, request: CreateDomainRequest, current_user: dict = Depends(get_current_user)):
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Domain name is required")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM rag_domains WHERE id = ? AND user_id = ?", (domain_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Domain not found")

    now = datetime.utcnow().isoformat()
    try:
        cursor.execute(
            "UPDATE rag_domains SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (request.name.strip(), request.description.strip(), now, domain_id, current_user["id"]),
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=409, detail="领域名称已存在")
    conn.close()

    return {"id": domain_id, "name": request.name.strip(), "description": request.description.strip()}


@router.delete("/domains/{domain_id}")
async def delete_domain(domain_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rag_domains WHERE id = ? AND user_id = ?", (domain_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Domain not found")

    cursor.execute("SELECT id, file_path FROM rag_documents WHERE domain_id = ? AND user_id = ?", (domain_id, current_user["id"]))
    for row in cursor.fetchall():
        doc = dict(row)
        file_path = Path(doc["file_path"])
        if file_path.exists():
            file_path.unlink()

    cursor.execute("DELETE FROM rag_documents WHERE domain_id = ? AND user_id = ?", (domain_id, current_user["id"]))
    cursor.execute("DELETE FROM rag_domains WHERE id = ? AND user_id = ?", (domain_id, current_user["id"]))
    conn.commit()
    conn.close()

    drop_domain_collection(domain_id, user_id=current_user["id"])

    return {"success": True}


# ---------- Document APIs (with domain scope) ----------

@router.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    domain_id: str = Form(...),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50),
    smart_split: bool = Form(True),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = Path(file.filename).suffix.lower().lstrip(".")
    if suffix not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {suffix}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM rag_domains WHERE id = ? AND user_id = ?", (domain_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="领域不存在")
    conn.close()

    doc_id = str(uuid.uuid4())
    safe_name = Path(file.filename).name
    file_path = UPLOAD_DIR / f"{doc_id}_{safe_name}"
    file_path.write_bytes(content)

    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO rag_documents (id, domain_id, filename, file_path, file_type, status, chunk_size, chunk_overlap, smart_split, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (doc_id, domain_id, safe_name, str(file_path), suffix, "pending", chunk_size, chunk_overlap, int(smart_split), current_user["id"], now, now),
    )
    conn.commit()
    conn.close()

    asyncio.create_task(asyncio.to_thread(process_document, doc_id))

    return {"id": doc_id, "filename": safe_name, "status": "pending", "domain_id": domain_id}


@router.get("/documents")
async def list_documents(current_user: dict = Depends(get_current_user), domain_id: Optional[str] = None, limit: int = 100, offset: int = 0):
    conn = get_connection()
    cursor = conn.cursor()
    if domain_id:
        cursor.execute(
            "SELECT * FROM rag_documents WHERE domain_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (domain_id, current_user["id"], limit, offset),
        )
        rows = cursor.fetchall()
        cursor.execute("SELECT COUNT(*) as total FROM rag_documents WHERE domain_id = ? AND user_id = ?", (domain_id, current_user["id"]))
    else:
        cursor.execute(
            "SELECT * FROM rag_documents WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (current_user["id"], limit, offset),
        )
        rows = cursor.fetchall()
        cursor.execute("SELECT COUNT(*) as total FROM rag_documents WHERE user_id = ?", (current_user["id"],))
    total = cursor.fetchone()["total"]
    conn.close()
    return {"total": total, "items": [dict(r) for r in rows]}


@router.get("/domains/{domain_id}/documents")
async def list_domain_documents(domain_id: str, limit: int = 100, offset: int = 0, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM rag_domains WHERE id = ? AND user_id = ?", (domain_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Domain not found")

    cursor.execute(
        "SELECT * FROM rag_documents WHERE domain_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (domain_id, current_user["id"], limit, offset),
    )
    rows = cursor.fetchall()
    cursor.execute("SELECT COUNT(*) as total FROM rag_documents WHERE domain_id = ? AND user_id = ?", (domain_id, current_user["id"]))
    total = cursor.fetchone()["total"]
    conn.close()
    return {"total": total, "items": [dict(r) for r in rows]}


@router.get("/documents/{doc_id}")
async def get_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rag_documents WHERE id = ? AND user_id = ?", (doc_id, current_user["id"]))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return dict(row)


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rag_documents WHERE id = ? AND user_id = ?", (doc_id, current_user["id"]))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    doc = dict(row)
    file_path = Path(doc["file_path"])
    if file_path.exists():
        file_path.unlink()

    cursor.execute("DELETE FROM rag_documents WHERE id = ? AND user_id = ?", (doc_id, current_user["id"]))
    conn.commit()
    conn.close()

    delete_vectors_by_doc_id(doc_id, domain_id=doc["domain_id"], user_id=current_user["id"])
    return {"success": True}


@router.post("/documents/{doc_id}/retrain")
async def retrain_document(doc_id: str, request: RetrainRequest, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rag_documents WHERE id = ? AND user_id = ?", (doc_id, current_user["id"]))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    doc = dict(row)
    cursor.execute(
        "UPDATE rag_documents SET status = ?, chunk_size = ?, chunk_overlap = ?, smart_split = ?, updated_at = datetime('now') WHERE id = ?",
        ("pending", request.chunk_size, request.chunk_overlap, int(request.smart_split), doc_id),
    )
    conn.commit()
    conn.close()

    asyncio.create_task(asyncio.to_thread(process_document, doc_id))
    return {"id": doc_id, "status": "pending"}


@router.get("/documents/{doc_id}/chunks")
async def get_document_chunks(doc_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT domain_id FROM rag_documents WHERE id = ? AND user_id = ?", (doc_id, current_user["id"]))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    chunks = get_chunks_by_doc_id(doc_id, domain_id=row["domain_id"], user_id=current_user["id"])
    return {"chunks": chunks}


# ---------- Retrieval & Chat APIs ----------

@router.post("/test-retrieval")
async def test_retrieval(request: TestRetrievalRequest, current_user: dict = Depends(get_current_user)):
    enabled = get_enabled_models(current_user["id"])
    if not enabled.get("embedding"):
        raise HTTPException(status_code=400, detail="Embedding 模型未启用，请先配置并启用")
    result = await retrieve(request.query, top_k=request.top_k, rerank_top_n=request.rerank_top_n, user_id=current_user["id"])
    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.post("/domains/{domain_id}/test-retrieval")
async def test_domain_retrieval(domain_id: str, request: TestRetrievalRequest, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM rag_domains WHERE id = ? AND user_id = ?", (domain_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Domain not found")
    conn.close()

    enabled = get_enabled_models(current_user["id"])
    if not enabled.get("embedding"):
        raise HTTPException(status_code=400, detail="Embedding 模型未启用，请先配置并启用")

    result = await retrieve(request.query, top_k=request.top_k, rerank_top_n=request.rerank_top_n, domain_id=domain_id, user_id=current_user["id"])
    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/stats")
async def rag_stats(current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM rag_documents WHERE status = 'ready' AND user_id = ?", (current_user["id"],))
    ready_count = cursor.fetchone()["total"]
    conn.close()
    milvus_stats = get_collection_stats(user_id=current_user["id"])
    return {"ready_documents": ready_count, "milvus": milvus_stats}


@router.get("/domains/{domain_id}/stats")
async def domain_stats(domain_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM rag_domains WHERE id = ? AND user_id = ?", (domain_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Domain not found")

    cursor.execute("SELECT COUNT(*) as total FROM rag_documents WHERE domain_id = ? AND status = 'ready' AND user_id = ?", (domain_id, current_user["id"]))
    ready_count = cursor.fetchone()["total"]
    conn.close()
    milvus_stats = get_collection_stats(domain_id=domain_id, user_id=current_user["id"])
    return {"ready_documents": ready_count, "milvus": milvus_stats}


# ---------- RAG Chat API ----------

async def _generate_rag_response(request: RagChatRequest, event_bus: EventBus, user_id: str):
    domain_id = request.domain_id
    session_id = request.session_id

    if session_id and not domain_id:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT domain_id FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        row = cursor.fetchone()
        conn.close()
        if row and row["domain_id"]:
            domain_id = row["domain_id"]

    if not domain_id:
        await event_bus.publish(HarnessEvent(
            type=EventType.ERROR,
            data={"message": "未指定知识领域"},
        ))
        return

    enabled = get_enabled_models(user_id)
    missing = []
    if not enabled.get("llm"):
        missing.append("LLM")
    if not enabled.get("embedding"):
        missing.append("Embedding")
    if missing:
        await event_bus.publish(HarnessEvent(
            type=EventType.ERROR,
            data={"message": f"{' 和 '.join(missing)} 模型未启用，请先配置并启用相应模型"}
        ))
        return

    history = []
    if session_id:
        summary = get_latest_summary(session_id)
        message_rows = get_messages_after_summary(session_id, summary)
        if summary:
            history.append(SystemMessage(content=f"Previous conversation summary: {summary['content']}"))
        for row in message_rows:
            if row["role"] == "user":
                history.append(HumanMessage(content=row["content"]))
            elif row["role"] == "assistant":
                history.append(AIMessage(content=row["content"]))

    total_tokens = context_compression.count_tokens(history)
    total_k = context_compression.context_window_k
    used_k = round(total_tokens / 1000, 1)
    percentage = round((used_k / total_k) * 100, 1) if total_k > 0 else 0
    await event_bus.publish(HarnessEvent(
        type=EventType.CONTEXT_INFO,
        data={"total_k": total_k, "used_k": used_k, "percentage": percentage}
    ))

    if session_id and context_compression.should_compress(history, user_id=user_id):
        compressed = await context_compression.compress(history, session_id, user_id=user_id)
        history = compressed

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, filename FROM rag_documents WHERE domain_id = ? AND user_id = ?", (domain_id, user_id))
    doc_names = {row["id"]: row["filename"] for row in cursor.fetchall()}
    conn.close()

    result = await retrieve(request.message, top_k=20, rerank_top_n=5, domain_id=domain_id, doc_names=doc_names, user_id=user_id)

    if result.get("error"):
        await event_bus.publish(HarnessEvent(
            type=EventType.ERROR,
            data={"message": result["error"]},
        ))
        return

    chunks = result.get("chunks", [])
    context = result.get("context", "")

    if not chunks:
        await event_bus.publish(HarnessEvent(
            type=EventType.MESSAGE_START,
            data={"role": "assistant"},
        ))
        msg = "根据现有知识库，没有找到相关信息。"
        for char in msg:
            await event_bus.publish(HarnessEvent(
                type=EventType.MESSAGE_CHUNK,
                data={"chunk": char},
            ))
        await event_bus.publish(HarnessEvent(
            type=EventType.MESSAGE_END,
            data={"content": msg},
        ))
        return

    await event_bus.publish(HarnessEvent(
        type=EventType.MESSAGE_START,
        data={"role": "assistant"},
    ))

    system_prompt = (
        "你是一个基于知识库的智能助手。请根据以下提供的参考文档内容回答用户问题。"
        "如果参考文档中没有相关信息，请明确说明。"
        "回答时请引用来源文件名，格式为 [来源: 文件名]。\n\n"
        f"参考文档:\n{context}"
    )

    messages = list(history)
    rag_system = SystemMessage(content=system_prompt)
    if messages and isinstance(messages[0], SystemMessage):
        existing = messages[0].content
        messages[0] = SystemMessage(content=system_prompt + "\n\n" + existing)
    else:
        messages.insert(0, rag_system)

    try:
        llm = get_llm(temperature=0.3, streaming=True, user_id=user_id)
        full_content = ""
        async for chunk in llm.astream(messages):
            text = chunk.content if hasattr(chunk, "content") else str(chunk)
            if text:
                full_content += text
                for char in text:
                    await event_bus.publish(HarnessEvent(
                        type=EventType.MESSAGE_CHUNK,
                        data={"chunk": char},
                    ))

        await event_bus.publish(HarnessEvent(
            type=EventType.MESSAGE_END,
            data={"content": full_content},
        ))
    except Exception as e:
        await event_bus.publish(HarnessEvent(
            type=EventType.ERROR,
            data={"message": str(e)},
        ))


@router.post("/chat")
async def rag_chat(request: RagChatRequest, current_user: dict = Depends(get_current_user)):
    event_bus = EventBus()
    user_id = current_user["id"]

    if request.session_id:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM sessions WHERE id = ? AND user_id = ?", (request.session_id, user_id))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Session not found")

        msg_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO messages (id, session_id, role, content, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, request.session_id, "user", request.message, user_id, now),
        )

        cursor.execute("SELECT title FROM sessions WHERE id = ?", (request.session_id,))
        row = cursor.fetchone()
        if row and (row["title"] == "New Session" or not row["title"]):
            title = request.message.strip()[:30] + ("..." if len(request.message.strip()) > 30 else "")
            cursor.execute(
                "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, request.session_id)
            )
        else:
            cursor.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (now, request.session_id)
            )

        conn.commit()
        conn.close()

    async def event_generator():
        gen_task = asyncio.create_task(_generate_rag_response(request, event_bus, user_id))
        assistant_content = ""

        try:
            async for event in event_bus.subscribe():
                if event.type == EventType.MESSAGE_CHUNK:
                    assistant_content += event.data.get("chunk", "")
                elif event.type == EventType.MESSAGE_END:
                    assistant_content = event.data.get("content", assistant_content)
                elif event.type == EventType.ERROR:
                    assistant_content += "\n[Error: " + event.data.get("message", "Unknown error") + "]"
                data = event.model_dump_json()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            if not gen_task.done():
                gen_task.cancel()
                try:
                    await gen_task
                except asyncio.CancelledError:
                    pass
            raise
        else:
            if not gen_task.done():
                try:
                    await gen_task
                except asyncio.CancelledError:
                    pass

        if request.session_id and assistant_content:
            conn = get_connection()
            cursor = conn.cursor()
            msg_id = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            cursor.execute(
                "INSERT INTO messages (id, session_id, role, content, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (msg_id, request.session_id, "assistant", assistant_content, user_id, now),
            )
            conn.commit()
            conn.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
