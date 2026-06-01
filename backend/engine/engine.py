"""run_chat_turn — 核心对话循环生成器"""

from typing import Generator

from engine.chat import ChatManager
from engine.tool import ToolRunner
from models.provider_schema import ProviderResponse


MAX_TOOL_ROUNDS = 10


def run_chat_turn(
    chat: ChatManager,
    tool_runner: ToolRunner,
    provider,
    tools: list[dict] | None = None,
) -> Generator[dict, None, ProviderResponse]:
    """
    执行一轮对话的工具调用循环。

    Args:
        chat: ChatManager 实例
        tool_runner: ToolRunner 实例
        provider: BaseProvider 实例
        tools: 可用工具 schema 列表

    Yields:
        dict 事件: text_chunk, thinking_chunk, tool_call, usage, error, done
    Returns:
        ProviderResponse 最终响应
    """
    tool_round = 0
    messages = chat.build_messages()

    while tool_round < MAX_TOOL_ROUNDS:
        tool_round += 1

        # 流式调用 LLM
        full_text = ""
        full_reasoning = ""
        tool_calls_result: list = []

        for event in provider.respond_stream(messages, tools):
            etype = event.get("type", "")

            if etype == "thinking_chunk":
                full_reasoning += event.get("content", "")
                yield event

            elif etype == "text_chunk":
                full_text += event.get("content", "")
                yield event

            elif etype == "thinking_done":
                yield event

            elif etype == "error":
                yield event
                return provider.last_response or ProviderResponse(text="", tool_calls=[])

        response = provider.last_response
        if response is None:
            break

        # 有工具调用则执行
        if response.has_tool_calls:
            chat.add_tool_call_message(response.tool_calls, response.reasoning)

            results, details = tool_runner.execute(response.tool_calls)
            for detail in details:
                yield detail

            for r in results:
                chat.add_tool_result_message(
                    tool_call_id=r["id"],
                    content=str(r["result"]),
                    success=r["success"],
                )
        else:
            # 最终回复
            chat.add_assistant_message(full_text, full_reasoning)
            yield {"type": "text_done"}
            if response.usage:
                yield {"type": "usage", **response.usage}
            yield {"type": "done"}
            return response

    # 达到轮次上限
    chat.add_assistant_message(full_text, full_reasoning)
    yield {"type": "max_rounds", "content": f"达到最大工具调用轮次 {MAX_TOOL_ROUNDS}"}
    yield {"type": "done"}
    return response or ProviderResponse(text="", tool_calls=[])
