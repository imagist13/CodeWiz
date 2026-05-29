"""JsonlTracer — 主链路事件 JSONL 留痕 (v3 §E Task 23).

评审锚点: 端到端.md §32 / §84 / §109 可观测性 + §154 AI 使用记录。

事件 kind 约定:
  llm_call / tool_call / acceptance / diff_summary / pr_created / gate_confirmed
"""

from __future__ import annotations
import json


from app.observability.trace import JsonlTracer


class TestJsonlTracer:
    def test_event_writes_jsonl_line(self, tmp_path):
        log = tmp_path / "trace.jsonl"
        tr = JsonlTracer(path=log)
        eid = tr.event("llm_call", model="deepseek-chat", tokens=480)
        assert isinstance(eid, str) and len(eid) >= 8

        lines = log.read_text().strip().splitlines()
        assert len(lines) == 1
        rec = json.loads(lines[0])
        assert rec["id"] == eid
        assert rec["kind"] == "llm_call"
        assert rec["model"] == "deepseek-chat"
        assert rec["tokens"] == 480
        assert isinstance(rec["ts"], float)

    def test_multiple_events_append(self, tmp_path):
        log = tmp_path / "trace.jsonl"
        tr = JsonlTracer(path=log)
        tr.event("llm_call", iter=0)
        tr.event("tool_call", name="readFileTool")
        tr.event("acceptance", ok=True)
        lines = log.read_text().strip().splitlines()
        assert len(lines) == 3
        kinds = [json.loads(ln)["kind"] for ln in lines]
        assert kinds == ["llm_call", "tool_call", "acceptance"]

    def test_creates_parent_dir(self, tmp_path):
        log = tmp_path / "deeply" / "nested" / "trace.jsonl"
        tr = JsonlTracer(path=log)
        tr.event("x")
        assert log.exists()

    def test_ids_are_unique(self, tmp_path):
        tr = JsonlTracer(path=tmp_path / "t.jsonl")
        ids = {tr.event("k") for _ in range(50)}
        assert len(ids) == 50

    def test_chinese_content_preserved(self, tmp_path):
        """ensure_ascii=False 保留中文."""
        log = tmp_path / "t.jsonl"
        tr = JsonlTracer(path=log)
        tr.event("llm_call", reasoning="我先分析需求...")
        text = log.read_text(encoding="utf-8")
        assert "我先分析需求" in text

    def test_default_path(self, tmp_path, monkeypatch):
        """无路径时默认 logs/trace.jsonl."""
        monkeypatch.chdir(tmp_path)
        tr = JsonlTracer()
        tr.event("x")
        assert (tmp_path / "logs" / "trace.jsonl").exists()
