from langchain_openai import ChatOpenAI
from langchain_openai.chat_models import base as _lco_base
from langchain_core.messages import AIMessage, AIMessageChunk
from app.core.config import get_settings


# Monkey-patch langchain-openai to support DeepSeek reasoning_content
_original_convert_delta = _lco_base._convert_delta_to_message_chunk


def _convert_delta_to_message_chunk_with_reasoning(_dict, default_class):
    chunk = _original_convert_delta(_dict, default_class)
    rc = _dict.get("reasoning_content")
    if rc is not None and isinstance(chunk, AIMessageChunk):
        chunk.additional_kwargs["reasoning_content"] = rc
    return chunk


_lco_base._convert_delta_to_message_chunk = _convert_delta_to_message_chunk_with_reasoning

_original_convert_dict = _lco_base._convert_dict_to_message


def _convert_dict_to_message_with_reasoning(_dict):
    msg = _original_convert_dict(_dict)
    rc = _dict.get("reasoning_content")
    if rc is not None and isinstance(msg, AIMessage):
        msg.additional_kwargs["reasoning_content"] = rc
    return msg


_lco_base._convert_dict_to_message = _convert_dict_to_message_with_reasoning

_original_convert_to_dict = _lco_base._convert_message_to_dict


def _convert_message_to_dict_with_reasoning(message):
    result = _original_convert_to_dict(message)
    rc = message.additional_kwargs.get("reasoning_content")
    if rc is not None and isinstance(message, AIMessage):
        result["reasoning_content"] = rc
        # DeepSeek rejects null content when reasoning_content is present.
        # Ensure content is at least an empty string.
        if result.get("content") is None:
            result["content"] = ""
    return result


_lco_base._convert_message_to_dict = _convert_message_to_dict_with_reasoning


def get_llm(temperature: float = 0.7, streaming: bool = True, user_id: str = None):
    settings = get_settings(user_id)
    return ChatOpenAI(
        model=settings.minimax_model,
        api_key=settings.minimax_api_key,
        base_url=settings.minimax_base_url,
        temperature=temperature,
        streaming=streaming,
        max_retries=2,
        timeout=settings.minimax_timeout,
    )
