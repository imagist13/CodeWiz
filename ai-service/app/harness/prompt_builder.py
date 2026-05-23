"""把 ResolvedStep + 源文件片段拼成 LLM messages。

设计原则:
  - LLM 工作面收得很窄: 已知文件 + 已知任务 + 严格输出格式 (unified diff)
  - 不同 prompt_template 用不同 system, 强化对 Sequelize/React 等语境约束
  - user message 含: 目标路径 / DSL 摘要 / 当前文件相关行
"""

import json
from typing import List, Dict

from app.harness.codemap_resolver import ResolvedStep


# FIXME(sprint-2): 9 套模板都在 _TEMPLATES 字典里, 用真豆包跑通后调优。
# 触发返工: LLM 多次输出非 unified diff / 漏掉 +++ b/path 头部 / 改错文件。
# 改法: 把出错的那一套加 "示例 diff" 段, 或者细化约束句, 不改 PromptBuilder 接口。
_GENERIC_SYSTEM = (
    "你是 JavaScript/Node.js 代码编辑助手。\n"
    "给定文件当前内容与改动需求, 仅输出一个 unified diff (`@@` 格式)。\n"
    "约束:\n"
    "  - 只输出 diff, 不解释\n"
    "  - 只改 user message 指定的那一个文件\n"
    "  - 保持原代码缩进风格\n"
    "  - 不要 import 新包"
)


_TEMPLATES: Dict[str, str] = {
    "add_field_model": (
        "你是 Sequelize Model 编辑助手, 给已有 model 在 init({...}) 字典里"
        "插入一个新字段定义。仅输出 unified diff。保持字段格式风格一致。"
    ),
    "add_field_migration": (
        "你是 Sequelize Migration 生成助手。生成一个新文件的完整内容 "
        "(还是用 unified diff 格式, --- /dev/null +++ <path>)。"
        "exports.up = async (qi, Sequelize) => { qi.addColumn(...) }; "
        "exports.down 对称回滚。"
    ),
    "add_field_route_response": (
        "你是 Express 路由响应字段补充助手。在 res.json({...}) 里加上"
        "新字段，保持已有字段顺序。仅输出 diff。"
    ),
    "inject_display": (
        "你是 React JSX 注入助手。在指定组件的渲染区域加一个新的"
        "只读显示绑定。位置由 dsl.position 暗示 (card_meta=meta 行 / "
        "detail_top=标题下 / sidebar=侧栏)。仅输出 diff。"
    ),
    "inject_button_jsx": (
        "你是 React 按钮注入助手。在指定组件加一个按钮 (label + onClick), "
        "onClick 暂时调用一个空函数 (下一 step 会 wire 起来)。仅输出 diff。"
    ),
    "inject_form_input_jsx": (
        "你是 React 表单输入注入助手。在编辑器组件加一个 <input> 或 <textarea>, "
        "value 绑到 dsl.binding state, 加 label。仅输出 diff。"
    ),
    "computed_display_jsx": (
        "你是 React 计算显示注入助手。引入 utils/text.js 的 compute 函数, "
        "在组件指定位置渲染 label_template, 其中 {value} 替换为计算结果。仅输出 diff。"
    ),
    "computed_display_util": (
        "你是前端工具函数生成助手。在 frontend/src/utils/text.js (若不存在则"
        "创建) 加一个具名 export 函数对应 dsl.compute。仅输出 diff。"
    ),
    "add_field_unit_test": (
        "你是 Jest+Sequelize 单测生成助手。生成一个新文件, 测试新字段的默认值 + "
        "migration 增列。仅输出 diff (--- /dev/null +++ <path>)。"
    ),
}


class PromptBuilder:
    def build(self, step: ResolvedStep, source: str) -> List[Dict[str, str]]:
        system = _TEMPLATES.get(step.prompt_template, _GENERIC_SYSTEM)
        user = (
            f"目标文件: {step.target_path}\n"
            f"action: {step.action}\n"
            f"DSL: {json.dumps(step.dsl, ensure_ascii=False)}\n"
            f"---\n"
            f"当前文件内容:\n{source}\n"
            f"---\n"
            f"请输出 unified diff (含 `--- a/{step.target_path}` 与 "
            f"`+++ b/{step.target_path}` 头部) 仅修改该文件。"
        )
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
