"""ReportGenerator — HTML/Markdown 评测报告生成"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from harness.evaluator import Evaluator, EvalResult


class ReportGenerator:
    """生成 HTML/Markdown 格式的评测报告"""

    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def generate_html(
        self,
        session_id: str,
        events: list[dict],
        result: EvalResult,
        requirement: dict | None = None,
    ) -> str:
        """生成 HTML 报告"""
        evaluator = Evaluator()
        data = evaluator.to_dict(result)

        tool_calls = [e for e in events if e.get("type") == "tool_call"]
        usages = [e for e in events if e.get("type") == "usage"]

        html = f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>SuperAgent 评测报告 — {session_id}</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; background: #f5f5f5; }}
  h1 {{ color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 0.5rem; }}
  h2 {{ color: #4f46e5; margin-top: 2rem; }}
  .card {{ background: white; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }}
  .metric {{ text-align: center; padding: 1rem; background: #f9fafb; border-radius: 6px; }}
  .metric .num {{ font-size: 2rem; font-weight: bold; color: #4f46e5; }}
  .metric .label {{ color: #666; font-size: 0.875rem; }}
  .pass {{ color: #16a34a; font-weight: bold; }}
  .fail {{ color: #dc2626; font-weight: bold; }}
  .badge {{ display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; }}
  .badge-green {{ background: #dcfce7; color: #16a34a; }}
  .badge-red {{ background: #fee2e2; color: #dc2626; }}
  .badge-gray {{ background: #f3f4f6; color: #6b7280; }}
  table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; }}
  th, td {{ text-align: left; padding: 0.75rem; border-bottom: 1px solid #e5e7eb; }}
  th {{ background: #f9fafb; font-weight: 600; }}
  .tool-log tr:nth-child(even) {{ background: #f9fafb; }}
</style>
</head>
<body>
<h1>SuperAgent 评测报告</h1>
<div class="card">
  <p><strong>Session ID:</strong> {session_id}</p>
  <p><strong>生成时间:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
</div>

<h2>一、评分总览</h2>
<div class="grid">
  <div class="metric">
    <div class="num">{data['resource']['total_tokens']:,}</div>
    <div class="label">总 Token</div>
  </div>
  <div class="metric">
    <div class="num">{data['resource']['tool_call_count']}</div>
    <div class="label">工具调用</div>
  </div>
  <div class="metric">
    <div class="num">{data['resource']['total_time_ms']:,}</div>
    <div class="label">工具耗时 (ms)</div>
  </div>
  <div class="metric">
    <div class="num">${data['resource']['total_cost_usd']:.4f}</div>
    <div class="label">估算成本</div>
  </div>
</div>

<h2>二、代码质量</h2>
<div class="card">
  <div class="grid">
    <div>
      <strong>ESLint 检查:</strong>
      <span class="{'badge badge-green' if data['code_quality']['lint_pass'] else 'badge badge-red'}">
        {'通过' if data['code_quality']['lint_pass'] else '未通过/未运行'}
      </span>
    </div>
    <div>
      <strong>单元测试:</strong>
      <span class="{'badge badge-green' if data['code_quality']['test_pass'] else 'badge badge-red'}">
        {'通过' if data['code_quality']['test_pass'] else '未通过/未运行'}
      </span>
    </div>
    <div>
      <strong>文件写入:</strong>
      <span class="badge badge-gray">{data['code_quality']['file_written']} 个文件</span>
    </div>
  </div>
</div>

<h2>三、流程合规</h2>
<div class="card">
  <div class="grid">
    <div>
      <strong>需求澄清:</strong>
      <span class="{'badge badge-green' if data['flow_compliance']['has_clarification'] else 'badge badge-gray'}">
        {'已完成' if data['flow_compliance']['has_clarification'] else '未执行'}
      </span>
    </div>
    <div>
      <strong>方案审批:</strong>
      <span class="{'badge badge-green' if data['flow_compliance']['has_plan_review'] else 'badge badge-gray'}">
        {'已审批' if data['flow_compliance']['has_plan_review'] else '未审批'}
      </span>
    </div>
    <div>
      <strong>人工介入:</strong>
      <span class="{'badge badge-green' if data['flow_compliance']['has_human_approval'] else 'badge badge-gray'}">
        {'已确认' if data['flow_compliance']['has_human_approval'] else '未确认'}
      </span>
    </div>
  </div>
</div>

<h2>四、可观测性</h2>
<div class="card">
  <div class="grid">
    <div>
      <strong>Token 日志:</strong>
      {'<span class="badge badge-green">有</span>' if data['observability']['has_token_log'] else '<span class="badge badge-red">缺失</span>'}
    </div>
    <div>
      <strong>延迟日志:</strong>
      {'<span class="badge badge-green">有</span>' if data['observability']['has_latency_log'] else '<span class="badge badge-red">缺失</span>'}
    </div>
    <div>
      <strong>成本明细:</strong>
      {'<span class="badge badge-green">有</span>' if data['observability']['has_cost_breakdown'] else '<span class="badge badge-red">缺失</span>'}
    </div>
  </div>
</div>

<h2>五、工具调用日志</h2>
<div class="card">
<table class="tool-log">
<tr><th>#</th><th>工具</th><th>参数</th><th>耗时</th><th>结果</th></tr>
"""
        for i, tc in enumerate(tool_calls[:50], 1):
            success = tc.get("success", False)
            result_preview = str(tc.get("result", ""))[:100].replace("<", "&lt;").replace(">", "&gt;")
            html += f"""<tr>
  <td>{i}</td>
  <td><code>{tc.get('name', '')}</code></td>
  <td><code>{json.dumps(tc.get('args', {}))[:80]}</code></td>
  <td>{tc.get('elapsed_ms', 0)}ms</td>
  <td class="{'pass' if success else 'fail'}">{'OK' if success else 'FAIL'}</td>
</tr>
"""

        html += """
</table>
</div>
</body>
</html>"""
        return html

    def save_report(
        self,
        session_id: str,
        events: list[dict],
        result: EvalResult,
        requirement: dict | None = None,
    ) -> str:
        """生成并保存报告"""
        html = self.generate_html(session_id, events, result, requirement)
        path = self.storage_dir / f"report_{session_id}.html"
        path.write_text(html, encoding="utf-8")
        return str(path)
