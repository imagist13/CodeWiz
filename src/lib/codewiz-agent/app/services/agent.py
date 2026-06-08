import asyncio
import json
import re
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.callbacks import AsyncCallbackHandler
from langgraph.graph import StateGraph, END, MessagesState

from app.db.database import get_connection, get_latest_summary, get_messages_after_summary
from app.services.llm import get_llm
from app.services.agent_prompt import build_system_prompt
from app.services.event_bus import EventBus, EventType, HarnessEvent
from app.services.settings_service import get_enabled_models
from app.tools.registry import tool_registry
from app.core.config import get_settings
from app.services.context_cache import context_cache
from app.services.context_compression import context_compression
from app.skills.manager import skill_manager


class StreamingCallbackHandler(AsyncCallbackHandler):
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self._current_think = ""
        self._current_message = ""
        self._has_reasoning_content = False
        self._token_buffer = ""
        self._think_started = False
        self._think_end_sent = False

    async def on_llm_start(self, serialized, prompts, **kwargs):
        # THINK_START is emitted on first reasoning token for DeepSeek,
        # or when <think> tag is detected for minimax.
        pass

    async def on_llm_new_token(self, token: str, **kwargs):
        # Only THINK_* events fire during streaming. Content tokens are NOT
        # emitted here — call_model decides after ainvoke returns whether to
        # stream the final content (no tool_calls) or discard it (intermediate
        # round whose preamble would otherwise flash on screen).
        chunk = kwargs.get("chunk")
        if chunk and hasattr(chunk, "message"):
            msg = chunk.message
            rc = getattr(msg, "additional_kwargs", {}).get("reasoning_content")
            if rc:
                if not self._has_reasoning_content:
                    self._has_reasoning_content = True
                    await self.event_bus.publish(HarnessEvent(
                        type=EventType.THINK_START,
                        data={"message": "Agent is thinking..."}
                    ))
                for char in rc:
                    await self.event_bus.publish(HarnessEvent(
                        type=EventType.THINK_CHUNK,
                        data={"chunk": char}
                    ))
                self._current_think += rc
                return

        # DeepSeek-style: first non-reasoning token signals end of thinking.
        if self._has_reasoning_content and token and not self._think_end_sent:
            self._think_end_sent = True
            await self.event_bus.publish(HarnessEvent(
                type=EventType.THINK_END,
                data={"content": self._current_think}
            ))
        if self._has_reasoning_content:
            return

        # minimax-style: parse <think>...</think> in token buffer for THINK_END.
        if token:
            self._token_buffer += token
            think_match = re.search(r'<think>([\s\S]*?)(?:</think>|$)', self._token_buffer)
            if think_match:
                new_think = think_match.group(1)
                if not self._think_started:
                    self._think_started = True
                    await self.event_bus.publish(HarnessEvent(
                        type=EventType.THINK_START,
                        data={"message": "Agent is thinking..."}
                    ))
                if len(new_think) > len(self._current_think):
                    delta = new_think[len(self._current_think):]
                    if delta:
                        for char in delta:
                            await self.event_bus.publish(HarnessEvent(
                                type=EventType.THINK_CHUNK,
                                data={"chunk": char}
                            ))
                    self._current_think = new_think
                if '</think>' in self._token_buffer and not self._think_end_sent:
                    self._think_end_sent = True
                    await self.event_bus.publish(HarnessEvent(
                        type=EventType.THINK_END,
                        data={"content": self._current_think}
                    ))

    async def on_llm_end(self, response, **kwargs):
        if (self._has_reasoning_content or self._think_started) and not self._think_end_sent:
            self._think_end_sent = True
            await self.event_bus.publish(HarnessEvent(
                type=EventType.THINK_END,
                data={"content": self._current_think}
            ))


class AgentState(MessagesState):
    tool_calls: List[dict]
    round_count: int


class AgentService:
    def __init__(self):
        self._graphs: Dict[str, Any] = {}

    def _load_session_history(self, session_id: str) -> tuple:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session_row = cursor.fetchone()
        conn.close()

        if not session_row:
            raise ValueError(f"Session {session_id} not found")

        session_row = dict(session_row)

        # Check cache first
        cached = context_cache.get(session_id)
        if cached:
            return session_row, cached["messages"]

        # Cache miss: query database with summary fallback
        summary = get_latest_summary(session_id)
        message_rows = get_messages_after_summary(session_id, summary)

        messages = []
        if summary:
            messages.append(SystemMessage(content=f"Previous conversation summary: {summary['content']}"))

        for row in message_rows:
            role = row["role"]
            content = row["content"] or ""
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                tool_calls_str = row.get("tool_calls")
                tool_calls = None
                if tool_calls_str:
                    try:
                        tool_calls = json.loads(tool_calls_str)
                    except Exception:
                        pass
                rc = row.get("reasoning_content")
                kwargs = {}
                if rc:
                    kwargs["additional_kwargs"] = {"reasoning_content": rc}
                msg = AIMessage(content=content, tool_calls=tool_calls or [], **kwargs)
                messages.append(msg)
            elif role == "tool":
                messages.append(ToolMessage(content=content, tool_call_id=row.get("tool_call_id", "")))

        # Populate cache
        context_cache.set(session_id, messages, summary=summary["content"] if summary else None)

        return session_row, messages

    def _save_message(self, session_id: str, role: str, content: str, user_id: str = "", tool_calls: Optional[list] = None, tool_call_id: Optional[str] = None, skill_name: Optional[str] = None, reasoning_content: Optional[str] = None):
        conn = get_connection()
        cursor = conn.cursor()
        msg_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        tool_calls_str = json.dumps(tool_calls) if tool_calls else None

        cursor.execute(
            "INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, user_id, created_at, skill_name, reasoning_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (msg_id, session_id, role, content, tool_calls_str, tool_call_id, user_id, now, skill_name, reasoning_content)
        )

        # Update session title with first user message if still default
        if role == "user":
            cursor.execute("SELECT title FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if row and row["title"] == "New Session":
                title = content.strip()[:30] + ("..." if len(content.strip()) > 30 else "")
                cursor.execute(
                    "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
                    (title, now, session_id)
                )

        cursor.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id)
        )
        conn.commit()
        conn.close()

    def _build_graph(self, session_id: str, event_bus: EventBus, session_row: dict):
        user_id = session_row.get("user_id", "")
        enabled_tools = tool_registry.get_enabled_tools(user_id)
        tool_instances = []
        for name, func in enabled_tools.items():
            from langchain_core.tools import StructuredTool
            meta = tool_registry.get_tool_config(name, user_id) or tool_registry._metadata.get(name, {})
            tool = StructuredTool.from_function(
                func=func,
                name=name,
                description=meta.get("description", ""),
            )
            tool_instances.append(tool)

        async def call_model(state: AgentState):
            messages = list(state.get("messages", []))

            # If agent tools were already completed in this turn, inject a hard stop
            last_user_idx = -1
            for i in range(len(messages) - 1, -1, -1):
                if isinstance(messages[i], HumanMessage):
                    last_user_idx = i
                    break

            agent_tools_done = set()
            for i in range(last_user_idx + 1, len(messages)):
                if isinstance(messages[i], ToolMessage):
                    try:
                        parsed = json.loads(messages[i].content)
                        if parsed.get("completed") is True:
                            agent_tools_done.add(parsed.get("tool", ""))
                    except Exception:
                        pass

            # Prepend dynamic system prompt, merging with existing summary if present
            system_prompt = build_system_prompt(user_id)

            if agent_tools_done:
                system_prompt += (
                    f"\n\nREMINDER: You already called agent tool(s): {', '.join(agent_tools_done)}. "
                    f"STOP calling tools and answer the user DIRECTLY with your own knowledge."
                )
            if messages and isinstance(messages[0], SystemMessage):
                existing = messages[0].content
                messages[0] = SystemMessage(content=system_prompt + "\n\n" + existing)
            else:
                messages.insert(0, SystemMessage(content=system_prompt))

            llm = get_llm(
                temperature=session_row["temperature"],
                streaming=True,
                user_id=user_id,
            )
            if tool_instances:
                llm = llm.bind_tools(tool_instances)

            callback_handler = StreamingCallbackHandler(event_bus)
            response = await llm.ainvoke(messages, config={"callbacks": [callback_handler]})

            has_tool_calls = hasattr(response, "tool_calls") and bool(response.tool_calls)

            if has_tool_calls:
                # Intermediate round: any preamble content (e.g. "找到了！...")
                # is silently discarded. The callback handler does not emit
                # MESSAGE_CHUNK events, so the frontend never sees it.
                # Persist the intermediate AIMessage so subsequent turns can
                # rebuild a complete message chain (AIMessage -> ToolMessages).
                rc = getattr(response, "additional_kwargs", {}).get("reasoning_content")
                self._save_message(
                    session_id, "assistant",
                    response.content or "",
                    user_id=user_id,
                    tool_calls=response.tool_calls,
                    skill_name=None,
                    reasoning_content=rc
                )
                context_cache.append_message(
                    session_id,
                    AIMessage(
                        content=response.content or "",
                        tool_calls=response.tool_calls,
                        additional_kwargs={"reasoning_content": rc} if rc else {}
                    )
                )
            else:
                # Final round: stream response.content char-by-char so the
                # frontend gets a typewriter effect. Strip any <think> tags
                # since they were already streamed via THINK_* events.
                content = response.content or ""
                content_clean = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
                if content_clean:
                    for char in content_clean:
                        await event_bus.publish(HarnessEvent(
                            type=EventType.MESSAGE_CHUNK,
                            data={"chunk": char}
                        ))
                        await asyncio.sleep(0.008)

            return {"messages": [response], "tool_calls": response.tool_calls if hasattr(response, "tool_calls") else []}

        async def call_tools(state: AgentState):
            tool_calls = state.get("tool_calls", [])
            tool_messages = []

            for tool_call in tool_calls:
                tool_name = tool_call.get("name", "")
                args = tool_call.get("args", {})
                tool_call_id = tool_call.get("id", "")

                try:
                    tool_func = tool_registry.get_tool(tool_name, user_id=user_id)
                    if tool_func:
                        if asyncio.iscoroutinefunction(tool_func):
                            result = await tool_func(**args)
                        else:
                            result = tool_func(**args)
                    else:
                        result = json.dumps({"error": f"Tool {tool_name} not found or disabled"})
                except Exception as e:
                    result = json.dumps({"error": str(e)})

                # Check if this is a parameter validation failure (need_user_input).
                is_validation_fail = False
                try:
                    parsed = json.loads(result)
                    if isinstance(parsed, dict) and parsed.get("need_user_input"):
                        is_validation_fail = True
                except Exception:
                    pass

                if not is_validation_fail:
                    await event_bus.publish(HarnessEvent(
                        type=EventType.TOOL_START,
                        data={"name": tool_name, "id": tool_call_id}
                    ))
                    await event_bus.publish(HarnessEvent(
                        type=EventType.TOOL_INPUT,
                        data={"name": tool_name, "input": args, "id": tool_call_id}
                    ))
                    await event_bus.publish(HarnessEvent(
                        type=EventType.TOOL_OUTPUT,
                        data={"name": tool_name, "output": result, "id": tool_call_id}
                    ))
                    await event_bus.publish(HarnessEvent(
                        type=EventType.TOOL_END,
                        data={"name": tool_name, "id": tool_call_id}
                    ))

                tool_msg = ToolMessage(content=str(result), tool_call_id=tool_call_id)
                tool_messages.append(tool_msg)
                self._save_message(session_id, "tool", str(result), user_id=user_id, tool_call_id=tool_call_id)
                context_cache.append_message(session_id, tool_msg)
            return {"messages": tool_messages, "tool_calls": [], "round_count": state.get("round_count", 0) + 1}

        def should_continue(state: AgentState):
            tool_calls = state.get("tool_calls", [])
            round_count = state.get("round_count", 0)

            if not tool_calls:
                return "end"
            if round_count >= get_settings().agent_max_tool_rounds:
                return "end"
            return "tools"

        workflow = StateGraph(AgentState)
        workflow.add_node("agent", call_model)
        workflow.add_node("tools", call_tools)
        workflow.set_entry_point("agent")
        workflow.add_conditional_edges(
            "agent",
            should_continue,
            {
                "tools": "tools",
                "end": END
            }
        )
        workflow.add_edge("tools", "agent")

        return workflow.compile()

    async def compact(self, session_id: str) -> dict:
        """Manually trigger context compression for a session."""
        session_row, history = self._load_session_history(session_id)
        compressible, protected = context_compression.split_messages(history)
        if not compressible:
            return {"compressed": False, "reason": "No compressible messages", "used_k": 0}

        summary = await context_compression.generate_summary(compressible)
        context_compression.save_summary(session_id, summary, len(compressible))
        context_compression._last_summary[session_id] = summary

        rebuilt = context_compression.rebuild_messages(summary, protected)
        context_cache.set(session_id, rebuilt, summary=summary)

        total_tokens = context_compression.count_tokens(rebuilt)
        used_k = round(total_tokens / 1000, 1)
        return {"compressed": True, "used_k": used_k, "summary_length": len(summary)}

    async def _execute_command(self, session_id: str, user_message: str, event_bus: EventBus) -> bool:
        """Parse and execute slash commands. Returns True if handled."""
        trimmed = user_message.strip()
        if not trimmed.startswith('/'):
            return False

        parts = trimmed[1:].split()
        cmd = parts[0] if parts else ''

        if cmd == 'compact':
            result = await self.compact(session_id)
            if result['compressed']:
                msg = f"Context compressed. Used: {result['used_k']}K."
            else:
                msg = f"Compression skipped: {result['reason']}"
        elif cmd == 'clear':
            context_cache.clear(session_id)
            msg = "Session cache cleared."
        elif cmd == 'readcache':
            import time
            entry = context_cache.get_raw(session_id)
            if not entry:
                msg = "Cache miss: no active cache for this session."
            else:
                lines = []
                lines.append(f"=== Cache Info ===")
                lines.append(f"Messages count: {len(entry['messages'])}")
                lines.append(f"Summary: {'yes' if entry.get('summary') else 'no'}")
                lines.append(f"Expires in: {int(entry['expires_at'] - time.time())}s")
                lines.append("")
                lines.append("=== Messages ===")
                for i, msg_obj in enumerate(entry['messages']):
                    role = type(msg_obj).__name__.replace('Message', '').lower()
                    content = getattr(msg_obj, 'content', '') or ''
                    preview = content[:200] + ('...' if len(content) > 200 else '')
                    lines.append(f"[{i}] {role}: {preview}")
                lines.append("")
                if entry.get('summary'):
                    lines.append(f"=== Summary ===")
                    lines.append(entry['summary'][:500])
                msg = "\n".join(lines)
        else:
            # Not a built-in command; check if it's a skill command
            from app.skills.manager import skill_manager
            if skill_manager.discovery.get_metadata(cmd):
                return False  # Let skill framework handle it
            msg = f"Unknown command: /{cmd}"

        # Get user_id from session
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        conn.close()
        cmd_user_id = row["user_id"] if row else ""

        # Save command and response to database
        self._save_message(session_id, "user", user_message, user_id=cmd_user_id)
        self._save_message(session_id, "assistant", msg, user_id=cmd_user_id)

        await event_bus.publish(HarnessEvent(
            type=EventType.MESSAGE_START,
            data={"role": "assistant"}
        ))
        await event_bus.publish(HarnessEvent(
            type=EventType.MESSAGE_CHUNK,
            data={"chunk": msg}
        ))
        await event_bus.publish(HarnessEvent(
            type=EventType.MESSAGE_END,
            data={"content": msg}
        ))
        event_bus.close()
        return True

    async def run(self, session_id: str, user_message: str, event_bus: EventBus):
        ai_content = ""
        ai_reasoning_content = ""
        ai_tool_calls = None

        try:
            # Handle slash commands
            if await self._execute_command(session_id, user_message, event_bus):
                return

            # Load session history (checks cache first)
            session_row, history = self._load_session_history(session_id)
            user_id = session_row.get("user_id", "")

            # Check if any LLM model is enabled
            enabled = get_enabled_models(user_id)
            if not enabled.get("llm"):
                await event_bus.publish(HarnessEvent(
                    type=EventType.ERROR,
                    data={"message": "LLM 模型未启用，请先配置并启用一个模型"}
                ))
                event_bus.close()
                return

            # Save user message
            self._save_message(session_id, "user", user_message, user_id=user_id)
            context_cache.append_message(session_id, HumanMessage(content=user_message))

            # Emit context info
            total_tokens = context_compression.count_tokens(history, user_id=user_id)
            total_k = context_compression.context_window_k
            used_k = round(total_tokens / 1000, 1)
            percentage = round((used_k / total_k) * 100, 1) if total_k > 0 else 0
            await event_bus.publish(HarnessEvent(
                type=EventType.CONTEXT_INFO,
                data={"total_k": total_k, "used_k": used_k, "percentage": percentage}
            ))

            # Trigger compression if threshold crossed
            if context_compression.should_compress(history, user_id=user_id):
                compressed = await context_compression.compress(history, session_id, user_id=user_id)
                context_cache.set(session_id, compressed, summary=context_compression._last_summary.get(session_id))
                history = compressed

            await event_bus.publish(HarnessEvent(
                type=EventType.MESSAGE_START,
                data={"role": "assistant"}
            ))

            graph = self._build_graph(session_id, event_bus, session_row)
            state = {"messages": history, "tool_calls": [], "round_count": 0}

            result = await graph.ainvoke(state)

            # Extract final AI message — prefer the last AIMessage that has actual content
            final_messages = result.get("messages", [])
            ai_messages = [msg for msg in final_messages if isinstance(msg, AIMessage)]
            ai_reasoning_content = ""

            if ai_messages:
                for msg in reversed(ai_messages):
                    if msg.content:
                        ai_content = msg.content
                        ai_reasoning_content = getattr(msg, "additional_kwargs", {}).get("reasoning_content", "")
                        if hasattr(msg, "tool_calls") and msg.tool_calls:
                            ai_tool_calls = msg.tool_calls
                        break
                if not ai_content:
                    ai_content = ai_messages[-1].content or ""
                    ai_reasoning_content = getattr(ai_messages[-1], "additional_kwargs", {}).get("reasoning_content", "")
                    if hasattr(ai_messages[-1], "tool_calls") and ai_messages[-1].tool_calls:
                        ai_tool_calls = ai_messages[-1].tool_calls

            # Extract thinking from <think> tags and clean content
            think_match = re.search(r'<think>([\s\S]*?)<\/think>', ai_content)
            thinking_content = think_match.group(1) if think_match else ""
            clean_content = re.sub(r'<think>[\s\S]*?<\/think>', '', ai_content).strip()

            # For non-reasoning models (e.g. minimax) that output <think> tags,
            # the StreamingCallbackHandler already emitted think_start/think_chunk
            # during streaming. Emit a final think_end here with the fully
            # extracted content (in case streaming extraction was incomplete).
            if thinking_content and not ai_reasoning_content:
                await event_bus.publish(HarnessEvent(
                    type=EventType.THINK_END,
                    data={"content": thinking_content}
                ))

            # MESSAGE_CHUNK events are already streamed by StreamingCallbackHandler
            # during token generation. Just emit MESSAGE_END to mark completion.
            await event_bus.publish(HarnessEvent(
                type=EventType.MESSAGE_END,
                data={"content": clean_content}
            ))

            # Save AI message (keep original content with <think> tags for history extraction)
            self._save_message(
                session_id, "assistant", ai_content, user_id=user_id, tool_calls=ai_tool_calls,
                skill_name=None, reasoning_content=ai_reasoning_content or None
            )
            context_cache.append_message(
                session_id,
                AIMessage(
                    content=ai_content or "",
                    tool_calls=ai_tool_calls or [],
                    additional_kwargs={"reasoning_content": ai_reasoning_content} if ai_reasoning_content else {}
                )
            )

        except asyncio.CancelledError:
            # User aborted: tokens already streamed via MESSAGE_CHUNK.
            # Just mark the end with clean content.
            content_to_save = ai_content or "已中断"
            clean_save = re.sub(r'<think>[\s\S]*?<\/think>', '', content_to_save).strip() or content_to_save
            await event_bus.publish(HarnessEvent(
                type=EventType.MESSAGE_END,
                data={"content": clean_save}
            ))
            self._save_message(
                session_id, "assistant", content_to_save, user_id=user_id, tool_calls=ai_tool_calls,
                skill_name=None, reasoning_content=ai_reasoning_content or None
            )
            context_cache.append_message(
                session_id,
                AIMessage(
                    content=content_to_save,
                    tool_calls=ai_tool_calls or [],
                    additional_kwargs={"reasoning_content": ai_reasoning_content} if ai_reasoning_content else {}
                )
            )
            raise
        except Exception as e:
            await event_bus.publish(HarnessEvent(
                type=EventType.ERROR,
                data={"message": str(e)}
            ))
        finally:
            event_bus.close()
