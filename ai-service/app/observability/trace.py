"""JsonlTracer — 主链路事件 JSONL 留痕 (v3 §E Task 23).

设计:
  - 一行一事件 (JSONL), 便于 tail -f + 流式吐到前端 SSE
  - ensure_ascii=False 保留中文 reasoning_content
  - event(kind, **fields) 返 id, 调用方可关联前后事件

事件 kind 约定 (本 plan 主链路):
  llm_call         / model, tokens, latency_ms, reasoning_len, tool_calls
  tool_call        / name, status, latency_ms
  acceptance       / check, ok, detail
  diff_summary     / files, lines_added, lines_removed
  pr_created       / branch, url, dry_run
  gate_confirmed   / gate, user_action

评审锚点: 端到端.md §32 / §84 / §109 可观测性 + §154 AI 使用记录。
"""

from __future__ import annotations
import json
import time
import uuid
from pathlib import Path
from typing import Any, Union


class JsonlTracer:
    def __init__(self, path: Union[str, Path] = "logs/trace.jsonl"):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def event(self, kind: str, **fields: Any) -> str:
        eid = uuid.uuid4().hex[:12]
        rec = {"id": eid, "ts": time.time(), "kind": kind, **fields}
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return eid
