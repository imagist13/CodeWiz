"""Chat API endpoint — uses LangChain AgentLoop"""
import uuid as uuid_mod
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.security import get_current_user
from app.core.database import get_db
from app.models.database import Message, Conversation
from app.models.schemas import ChatRequest

router = APIRouter(prefix="/api", tags=["chat"])

SYSTEM_PROMPT = """You are an AI coding assistant built with the Adorable framework.

You have access to tools that let you:
- Read, write, and search files (all files go into the project sandbox directory)
- Execute shell commands (bash/npm/git) in the project directory
- List directories and check app status
- Start the dev server: startDevServerTool()
- Save the preview URL to the backend: updateProjectPreviewTool(previewUrl=...) — REQUIRED after starting the server
- Get preview URL: getPreviewUrlTool()

**IMPORTANT: Preview workflow (follow these steps in order)**
1. User asks to build something
2. Write files using writeFileTool
3. Call startDevServerTool() to start the preview server
4. Call updateProjectPreviewTool(previewUrl=<URL from step 3>) to save it to the backend
5. Tell the user: "Your app is visible in the right-side preview panel"

The startDevServerTool returns a proxy preview URL like /api/sandbox-preview/<repoId>.
Always pass this URL to updateProjectPreviewTool. Do NOT construct URLs manually.

Example:
User: "Build a counter"
You:
  writeFileTool({file: "index.html", content: "<html>..."})
  startDevServerTool()  → returns proxy URL like /api/sandbox-preview/abc123
  updateProjectPreviewTool({previewUrl: "/api/sandbox-preview/abc123"})
  "Your counter app is now visible in the right-side preview panel."

Use these tools to help users build applications. Be helpful and concise."""


def _sse(type_: str, **fields) -> str:
    import json
    return f"data: {json.dumps({'type': type_, **fields})}\n\n"


def _parse_tool_input_json(args_str: str):
    """tool-input-available 需要结构化 input，供 AI SDK 校验。"""
    import json
    if not (args_str or "").strip():
        return {}
    try:
        return json.loads(args_str)
    except json.JSONDecodeError:
        return {"raw": args_str}


@router.post("/chat")
async def chat(
    request: ChatRequest,
    http_request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.conversation_id:
        raise HTTPException(status_code=400, detail="conversation_id is required")

    # Extract Bearer token for backend API calls
    auth_header = http_request.headers.get("authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    conversation = db.query(Conversation).filter(
        Conversation.id == request.conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Build messages dict list from request
    messages_for_agent = []
    new_user_message: str = ""
    for msg in request.messages:
        msg_dict = {"role": msg.role, "id": msg.id, "parts": []}
        full_content = ""
        for part in msg.parts:
            if part.type == "text" and part.text:
                full_content += part.text
                msg_dict["parts"].append({"type": "text", "text": part.text})
            elif part.type == "tool_result" and part.tool_call:
                msg_dict["parts"].append({
                    "type": "tool_result",
                    "tool_call_id": part.tool_call.get("id", ""),
                    "content": part.tool_call.get("result", ""),
                    "tool_call": part.tool_call,
                })
        if msg.role == "user" and full_content.strip():
            new_user_message = full_content
        messages_for_agent.append(msg_dict)

    from app.harness.agent import AgentLoop
    from app.harness import tools as tool_module

    # 设置项目沙箱上下文（线程局部变量）
    repo_id = request.repo_id or request.project_id
    tool_module.set_current_context(repo_id, token)

    # 用数据库里的 conversation_id（转字符串）作为记忆持久化的唯一 key
    conversation_id_str = str(request.conversation_id)
    agent = AgentLoop(system=SYSTEM_PROMPT, conversation_id=conversation_id_str)

    # 把从前端/数据库读出来的历史消息导入持久化记忆（避免每次重启丢失）
    agent._import_external_messages(messages_for_agent)

    async def generate():
        stream_text_id: str | None = None

        try:
            # Save user message first
            try:
                if new_user_message:
                    db.add(Message(
                        conversation_id=request.conversation_id,
                        role="user",
                        content=new_user_message,
                    ))
                    db.commit()
            except Exception:
                pass

            async for event in agent.run(new_user_message):
                if event.type == "content":
                    if stream_text_id is None:
                        stream_text_id = str(uuid_mod.uuid4())
                        yield _sse("text-start", id=stream_text_id)
                    yield _sse("text-delta", id=stream_text_id, delta=event.content)

                elif event.type == "tool_call":
                    if stream_text_id:
                        yield _sse("text-end", id=stream_text_id)
                        stream_text_id = None
                    yield _sse(
                        "tool-input-start",
                        toolCallId=event.tool_call_id,
                        toolName=event.tool_name,
                    )
                    yield _sse(
                        "tool-input-delta",
                        toolCallId=event.tool_call_id,
                        inputTextDelta=event.tool_args or "",
                    )
                    yield _sse(
                        "tool-input-available",
                        toolCallId=event.tool_call_id,
                        toolName=event.tool_name,
                        input=_parse_tool_input_json(event.tool_args or ""),
                        providerExecuted=True,
                    )

                elif event.type == "tool_result":
                    if stream_text_id:
                        yield _sse("text-end", id=stream_text_id)
                        stream_text_id = None
                    yield _sse(
                        "tool-output-available",
                        toolCallId=event.tool_call_id,
                        output=str(event.tool_result),
                        providerExecuted=True,
                    )

                elif event.type == "finish":
                    if stream_text_id:
                        yield _sse("text-end", id=stream_text_id)
                        stream_text_id = None
                    yield _sse("finish", finishReason="stop")

                    # Save assistant message
                    try:
                        db.add(Message(
                            conversation_id=request.conversation_id,
                            role="assistant",
                            content=event.content,
                        ))
                        db.commit()
                    except Exception:
                        pass

                elif event.type == "error":
                    if stream_text_id:
                        yield _sse("text-end", id=stream_text_id)
                        stream_text_id = None
                    yield _sse("error", errorText=event.content)

        except Exception as e:
            if stream_text_id:
                yield _sse("text-end", id=stream_text_id)
            yield _sse("error", errorText=str(e))

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
