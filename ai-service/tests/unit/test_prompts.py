"""ExploreEditAgent 4 个 prompt 常量 (v3 Task 24 / v2.2 P-1).

护栏目的: prompt 是执行纪律层, 关键规则一旦丢失等于纪律失效。
test_system_prompt_contains_core_rules 是反静默改弱的护栏。
"""


from app.agents.prompts.explore_edit import (
    EXPLORE_EDIT_SYSTEM_PROMPT,
    CONTRACT_PROMPT_TEMPLATE,
    ACCEPTANCE_FAILURE_TEMPLATE,
    TOOL_ERROR_RECOVERY_TEMPLATE,
)


class TestSystemPrompt:
    def test_contains_core_discipline(self):
        """关键纪律词必须存在 (反静默改弱护栏)。"""
        p = EXPLORE_EDIT_SYSTEM_PROMPT
        assert "Do not assume file paths" in p
        assert "edit_file" in p or "edit" in p.lower()
        assert "Do not add dependencies" in p
        assert "package.json" in p
        assert "acceptance" in p.lower()

    def test_explore_before_edit(self):
        """先探索再编辑的纪律."""
        p = EXPLORE_EDIT_SYSTEM_PROMPT.lower()
        assert "list_dir" in p or "explore" in p
        assert "grep" in p

    def test_mentions_tool_layer_enforcement(self):
        """提示 forbid 工具层也会拦, 不只是 prompt 软约束."""
        p = EXPLORE_EDIT_SYSTEM_PROMPT
        assert "tool" in p.lower()


class TestContractTemplate:
    def test_renders_all_fields(self):
        rendered = CONTRACT_PROMPT_TEMPLATE.format(
            goal="加 viewCount 字段",
            constraints="  - 字段名必须 viewCount",
            forbid="  - 不要新增依赖",
            acceptance="  - FileContains('a.js', 'viewCount')",
            candidate_symbols="  - Article",
        )
        assert "加 viewCount 字段" in rendered
        assert "字段名必须 viewCount" in rendered
        assert "不要新增依赖" in rendered
        assert "Article" in rendered

    def test_no_unrendered_placeholders(self):
        rendered = CONTRACT_PROMPT_TEMPLATE.format(
            goal="x",
            constraints="-",
            forbid="-",
            acceptance="-",
            candidate_symbols="-",
        )
        # 已渲染后, 大括号占位符必须全消
        # (允许内容里有零星 {, 但不能是 {goal} 这种 format 占位)
        import re

        leftover = re.findall(r"\{[a-z_]+\}", rendered)
        assert leftover == [], f"unrendered placeholders: {leftover}"


class TestAcceptanceFailureTemplate:
    def test_renders(self):
        rendered = ACCEPTANCE_FAILURE_TEMPLATE.format(
            failed_checks="  - FileContains('x.js', 'foo'): missing"
        )
        assert "Acceptance failed" in rendered
        assert "missing" in rendered

    def test_mentions_no_repeat_and_no_forbidden(self):
        """失败重试时必须告诉模型: 不要重复同样的失败 / 不要碰禁区."""
        p = ACCEPTANCE_FAILURE_TEMPLATE
        assert "repeat" in p.lower()
        assert "forbidden" in p.lower()


class TestToolErrorRecoveryTemplate:
    def test_renders(self):
        rendered = TOOL_ERROR_RECOVERY_TEMPLATE.format(
            tool_name="edit_file",
            error="find string matches 3x in x.js",
        )
        assert "edit_file" in rendered
        assert "3x" in rendered

    def test_mentions_specific_strategies(self):
        """工具失败时给出具体复原策略."""
        p = TOOL_ERROR_RECOVERY_TEMPLATE.lower()
        assert "specific" in p or "context" in p
        assert "smaller" in p or "tighter" in p or "find" in p
