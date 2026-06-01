from typing import Dict, List, Optional, Tuple

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage

from app.db.database import insert_summary, get_connection
from app.services.llm import get_llm


COMPRESSION_PROMPT_TEMPLATE = """You are a conversation summarization engine. Your task is to merge a previous summary with new conversation turns into a single, unified, information-dense summary.

## Compression Rules
1. MANDATORY RETAIN: user instructions, key conclusions, core data, business decisions, configuration preferences, long-term role settings
2. SELECTIVE RETAIN: core intent of questions, necessary context, key logic
3. MANDATORY REMOVE: reasoning processes, step-by-step thinking fragments, polite filler, repeated phrases, meaningless padding, emoji
4. PROHIBITED: [system], [user], [assistant] role markers, <think> tags, any segmentation labels
5. STRATEGY: condense long passages/logs into summaries keeping main points; delete examples and expanded descriptions
6. FORMAT: pure plain text only, no tuples, no objects, no fragments, no prefixes, no suffixes, no extra explanations
7. DO NOT invent information, alter original meaning, or omit key constraints
8. DEDUPLICATION: If the new conversation covers the same topic as the previous summary, KEEP ONLY the most detailed version. Do NOT repeat the same topic from both sources. Replace older overview with newer detailed content.
9. MERGE STRATEGY: Treat previous summary as a base. Add new topics from new conversation. For overlapping topics, keep the newer/more detailed version and drop the older/less detailed one. Merge related facts into a coherent narrative rather than listing them separately.

{previous_summary_section}
## New Conversation
{conversation}

## Output Requirements
You MUST produce a single unified summary that INCLUDES all key facts from both sources WITHOUT duplication. If a topic appears in both, present it once with the most complete information. Output ONLY the refined summary body. No prefix, no suffix, no markdown code blocks, no role labels."""


class ContextCompression:
    def __init__(self, context_window_k: int = 128):
        self.context_window_k = context_window_k
        self.threshold_ratio = 0.8
        self._last_summary: Dict[str, Optional[str]] = {}

    def count_tokens(self, messages: List[BaseMessage], user_id: str = None) -> int:
        try:
            llm = get_llm(temperature=0.7, streaming=False, user_id=user_id)
            total = 0
            for msg in messages:
                if hasattr(llm, 'get_num_tokens_from_messages'):
                    total += llm.get_num_tokens_from_messages([msg])
                elif hasattr(llm, 'get_num_tokens'):
                    total += llm.get_num_tokens(msg.content or '')
                else:
                    total += len(msg.content or '') // 4
            return total
        except Exception:
            return sum(len(msg.content or '') // 4 for msg in messages)

    def should_compress(self, messages: List[BaseMessage], user_id: str = None) -> bool:
        total_k = self.count_tokens(messages, user_id=user_id) / 1000
        return total_k >= (self.context_window_k * self.threshold_ratio)

    def split_messages(self, messages: List[BaseMessage], protected_rounds: int = 0) -> Tuple[List[BaseMessage], List[BaseMessage]]:
        if protected_rounds == 0:
            return messages, []

        user_indices = [i for i, msg in enumerate(messages) if isinstance(msg, HumanMessage)]
        if len(user_indices) <= protected_rounds:
            return [], messages

        split_idx = user_indices[-protected_rounds]
        compressible = messages[:split_idx]
        protected = messages[split_idx:]
        return compressible, protected

    def build_compression_prompt(self, compressible_messages: List[BaseMessage]) -> str:
        previous_summary = ""
        conversation_lines = []

        for msg in compressible_messages:
            if isinstance(msg, SystemMessage):
                # Extract previous summary content (strip the prefix we added)
                content = msg.content or ""
                if content.startswith("Previous conversation summary: "):
                    previous_summary = content[len("Previous conversation summary: "):]
                else:
                    previous_summary = content
            elif isinstance(msg, HumanMessage):
                conversation_lines.append(f"User: {msg.content}")
            elif isinstance(msg, AIMessage):
                conversation_lines.append(f"Assistant: {msg.content}")
            elif isinstance(msg, ToolMessage):
                conversation_lines.append(f"Tool result: {msg.content}")
            else:
                conversation_lines.append(f"{msg.type}: {msg.content}")

        conversation = "\n\n".join(conversation_lines)

        previous_summary_section = ""
        if previous_summary:
            previous_summary_section = f"## Previous Summary\n{previous_summary}\n\n"

        return COMPRESSION_PROMPT_TEMPLATE.format(
            previous_summary_section=previous_summary_section,
            conversation=conversation
        )

    async def generate_summary(self, compressible_messages: List[BaseMessage], user_id: str = None) -> str:
        prompt = self.build_compression_prompt(compressible_messages)
        llm = get_llm(temperature=0.3, streaming=False, user_id=user_id)
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        summary = response.content or ""
        summary = summary.strip()
        # Strip any remaining think tags just in case
        import re
        summary = re.sub(r'<think>[\s\S]*?</think>', '', summary, flags=re.DOTALL)
        summary = re.sub(r'\[system\]|\[user\]|\[assistant\]', '', summary)
        summary = summary.strip()
        return summary

    def save_summary(self, session_id: str, summary: str, message_count_before: int) -> str:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        conn.close()
        user_id = row["user_id"] if row else ""
        return insert_summary(session_id, user_id, summary, message_count_before)

    def rebuild_messages(self, summary: str, protected_messages: List[BaseMessage]) -> List[BaseMessage]:
        summary_msg = SystemMessage(content=f"Previous conversation summary: {summary}")
        return [summary_msg] + protected_messages

    async def compress(self, messages: List[BaseMessage], session_id: str, protected_rounds: int = 0, user_id: str = None) -> List[BaseMessage]:
        compressible, protected = self.split_messages(messages, protected_rounds)
        if not compressible:
            self._last_summary.pop(session_id, None)
            return messages

        summary = await self.generate_summary(compressible, user_id=user_id)
        self._last_summary[session_id] = summary
        self.save_summary(session_id, summary, len(compressible))
        return self.rebuild_messages(summary, protected)


context_compression = ContextCompression()
