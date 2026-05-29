"""LLM 调用记账装饰器。

usage:
    rec = LLMRecorder(session_factory=SessionLocal,
                      session_id="abc-123", model="ep-...")
    wrapped_llm = rec.wrap(real_llm)
    # wrapped_llm 实现 LLMClient Protocol, 多了 skill_name/prompt_key/step_id kwargs
    # 每次调用前后写一行 LLMCall, 失败也写。
"""

import time
from typing import Optional, List, Dict, Any

from app.agents.llm_protocol import LLMResponse
from app.observability.models import LLMCall


class _WrappedLLM:
    def __init__(self, inner, recorder: "LLMRecorder"):
        self._inner = inner
        self._rec = recorder

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        max_tokens: int = 2048,
        skill_name: Optional[str] = None,
        prompt_key: Optional[str] = None,
        step_id: Optional[str] = None,
    ) -> LLMResponse:
        started = time.monotonic()
        try:
            out = await self._inner.chat(
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            elapsed = int((time.monotonic() - started) * 1000)
            self._rec._write(
                tokens_in=0,
                tokens_out=0,
                latency_ms=elapsed,
                cost_cny=0.0,
                status="error",
                error_msg=str(exc),
                skill_name=skill_name,
                prompt_key=prompt_key,
                step_id=step_id,
            )
            raise
        elapsed = int((time.monotonic() - started) * 1000)
        self._rec._write(
            tokens_in=out.tokens_in,
            tokens_out=out.tokens_out,
            latency_ms=elapsed,
            cost_cny=out.cost_cny,
            status="ok",
            error_msg=None,
            skill_name=skill_name,
            prompt_key=prompt_key,
            step_id=step_id,
        )
        return out


class LLMRecorder:
    def __init__(self, *, session_factory, session_id: str, model: str):
        self._session_factory = session_factory
        self._session_id = session_id
        self._model = model

    def wrap(self, inner) -> _WrappedLLM:
        return _WrappedLLM(inner, self)

    def _write(self, **fields: Any) -> None:
        with self._session_factory() as db:
            row = LLMCall(
                session_id=self._session_id,
                model=self._model,
                **fields,
            )
            db.add(row)
            db.commit()
