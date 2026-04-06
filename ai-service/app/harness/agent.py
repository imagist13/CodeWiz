"""
Agent Loop using LangChain
"""
import json
import uuid
from typing import List, Dict, Any, AsyncIterator, Tuple
from dataclasses import dataclass
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage

settings = None


def _get_settings():
    global settings
    if settings is None:
        from app.core.config import get_settings
        settings = get_settings()
    return settings


@dataclass
class StreamEvent:
    type: str
    content: str = ""
    tool_call_id: str = ""
    tool_name: str = ""
    tool_args: str = ""
    tool_result: Any = None
    finish_reason: str = ""


def _get_tools() -> List[Any]:
    from app.harness import tools as tool_module
    return tool_module.get_tools()


def _tool_calls_openai_style(output: Any) -> List[Dict[str, Any]]:
    """
    LangChain 流式结束时，工具调用常在 AIMessage.tool_calls（[{name, args, id}]），
    而不是 additional_kwargs['tool_calls']。只读后者会导致永远不执行工具。
    """
    if output is None:
        return []

    # 1) LangChain 标准字段 AIMessage.tool_calls
    raw = getattr(output, "tool_calls", None)
    if raw:
        out: List[Dict[str, Any]] = []
        for tc in raw:
            if isinstance(tc, dict):
                name = tc.get("name") or ""
                tid = tc.get("id") or ""
                args = tc.get("args")
                if args is None:
                    args = tc.get("arguments", {})
                if isinstance(args, str):
                    args_str = args
                else:
                    args_str = json.dumps(args, ensure_ascii=False) if args else "{}"
                out.append(
                    {
                        "id": tid,
                        "function": {"name": name, "arguments": args_str},
                    }
                )
        return out

    # 2) OpenAI 原始 additional_kwargs
    ak = getattr(output, "additional_kwargs", None) or {}
    tc_list = ak.get("tool_calls") or []
    if isinstance(tc_list, list):
        return tc_list
    return []


class AgentLoop:
    def __init__(self, system: str = "", max_iterations: int = 10):
        self.system = system
        self.max_iterations = max_iterations

    def _to_langchain_messages(self, messages: List[Dict[str, Any]]) -> List:
        result = [SystemMessage(content=self.system)]
        for msg in messages:
            role = msg.get("role", "user")
            content = ""
            parts = msg.get("parts", [])

            msg_content = msg.get("content", "")
            if isinstance(msg_content, str) and msg_content:
                content = msg_content

            for part in parts:
                if part.get("type") == "text":
                    content += part.get("text", "")
                elif part.get("type") == "tool_result":
                    tool_call = part.get("tool_call") or {}
                    content += f"\n\n[TOOL RESULT: {tool_call.get('result', '')}]"

            if not content.strip():
                continue

            if role == "user":
                result.append(HumanMessage(content=content))
            elif role == "assistant":
                result.append(AIMessage(content=content))
            elif role == "tool":
                tc_id = msg.get("tool_call_id", "")
                result.append(ToolMessage(content=content, tool_call_id=tc_id))

        return result

    async def run(self, messages: List[Dict[str, Any]]) -> AsyncIterator[StreamEvent]:
        cfg = _get_settings()
        if not (cfg.silicon_flow_api_key or "").strip():
            yield StreamEvent(
                type="error",
                content=(
                    "未配置 Silicon Flow API Key：请在 Adorable/.env 或 ai-service/.env 中设置 "
                    "SILICON_FLOW_API_KEY（见 https://cloud.siliconflow.cn ）。"
                ),
            )
            return

        llm = ChatOpenAI(
            model=cfg.llm_model,
            api_key=cfg.silicon_flow_api_key,
            base_url=cfg.silicon_flow_api_url,
            streaming=True,
            temperature=0,
            timeout=120,
        )

        tools = _get_tools()
        if tools:
            llm = llm.bind_tools(tools)

        lc_messages = self._to_langchain_messages(messages)
        iteration = 0
        full_text = ""

        while iteration < self.max_iterations:
            iteration += 1
            tool_calls_made = False
            full_text = ""

            try:
                async for event in llm.astream_events(lc_messages):
                    etype = event.get("event")
                    data = event.get("data", {})

                    if etype == "on_chat_model_stream":
                        chunk = data.get("chunk", {})
                        content = chunk.content if hasattr(chunk, "content") else str(chunk)
                        if content:
                            full_text += content
                            yield StreamEvent(type="content", content=content)

                    elif etype == "on_chat_model_end":
                        out = data.get("output")
                        tc_list = _tool_calls_openai_style(out)
                        if tc_list:
                            from app.harness.tools import dispatch_tool

                            parsed: List[Tuple[str, str, str]] = []
                            tool_calls_lc: List[Dict[str, Any]] = []
                            for tc in tc_list:
                                tc_id = tc.get("id") or str(uuid.uuid4())
                                func = tc.get("function") or {}
                                name = func.get("name", "")
                                args_str = func.get("arguments", "{}")
                                if not isinstance(args_str, str):
                                    args_str = json.dumps(args_str, ensure_ascii=False)
                                try:
                                    args_obj = json.loads(args_str) if args_str else {}
                                except json.JSONDecodeError:
                                    args_obj = {}
                                parsed.append((tc_id, name, args_str))
                                tool_calls_lc.append(
                                    {
                                        "name": name,
                                        "args": args_obj,
                                        "id": tc_id,
                                        "type": "tool_call",
                                    }
                                )

                            lc_messages.append(
                                AIMessage(content=full_text, tool_calls=tool_calls_lc)
                            )

                            for tc_id, name, args_str in parsed:
                                yield StreamEvent(
                                    type="tool_call",
                                    tool_call_id=tc_id,
                                    tool_name=name,
                                    tool_args=args_str,
                                )
                                result = dispatch_tool(name, tc_id, args_str)
                                lc_messages.append(
                                    ToolMessage(
                                        content=str(result.result),
                                        tool_call_id=tc_id,
                                    )
                                )
                                yield StreamEvent(
                                    type="tool_result",
                                    tool_call_id=tc_id,
                                    tool_name=name,
                                    tool_result=result.result,
                                )
                            tool_calls_made = True

            except Exception as e:
                yield StreamEvent(type="error", content=str(e))
                return

            if tool_calls_made:
                continue
            else:
                if full_text:
                    lc_messages.append(AIMessage(content=full_text))
                yield StreamEvent(type="finish", content=full_text)
                return