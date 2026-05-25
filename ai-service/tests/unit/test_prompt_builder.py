from app.harness.prompt_builder import PromptBuilder
from app.harness.codemap_resolver import ResolvedStep


def _step(
    action="edit_sequelize_model",
    dsl=None,
    prompt_template="add_field_model",
    target_path="backend/db/models/article.js",
    target_lines=(10, 30),
):
    return ResolvedStep(
        step_id="s1",
        layer="backend",
        action=action,
        dsl=dsl
        or {
            "model": "Article",
            "field_name": "viewCount",
            "field_type": "int",
            "default": 0,
        },
        prompt_template=prompt_template,
        target_path=target_path,
        target_lines=target_lines,
    )


SAMPLE_SRC = """const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Article extends Model {}

  Article.init({
    title: { type: DataTypes.STRING },
    body: { type: DataTypes.TEXT },
  }, { sequelize });

  return Article;
};
"""


class TestPromptBuilder:
    def test_emits_system_and_user_messages(self):
        b = PromptBuilder()
        msgs = b.build(_step(), source=SAMPLE_SRC)
        assert msgs[0]["role"] == "system"
        assert msgs[1]["role"] == "user"

    def test_user_message_includes_target_path(self):
        b = PromptBuilder()
        msgs = b.build(_step(), source=SAMPLE_SRC)
        assert "backend/db/models/article.js" in msgs[1]["content"]

    def test_user_message_includes_dsl_field_name(self):
        b = PromptBuilder()
        msgs = b.build(_step(), source=SAMPLE_SRC)
        assert "viewCount" in msgs[1]["content"]

    def test_user_message_includes_source_snippet(self):
        b = PromptBuilder()
        msgs = b.build(_step(), source=SAMPLE_SRC)
        assert "Article.init" in msgs[1]["content"]

    def test_system_message_demands_diff_only(self):
        b = PromptBuilder()
        msgs = b.build(_step(), source=SAMPLE_SRC)
        assert "diff" in msgs[0]["content"].lower()

    def test_different_template_keys_yield_different_systems(self):
        b = PromptBuilder()
        m1 = b.build(_step(prompt_template="add_field_model"), source=SAMPLE_SRC)[0][
            "content"
        ]
        m2 = b.build(_step(prompt_template="inject_display"), source=SAMPLE_SRC)[0][
            "content"
        ]
        assert m1 != m2

    def test_unknown_template_falls_back_to_generic(self):
        b = PromptBuilder()
        # 未注册的模板不应崩, 应走通用 system prompt
        msgs = b.build(_step(prompt_template="never_seen"), source=SAMPLE_SRC)
        assert "diff" in msgs[0]["content"].lower()

    def test_user_message_has_line_numbers(self):
        b = PromptBuilder()
        msgs = b.build(_step(), source=SAMPLE_SRC)
        body = msgs[1]["content"]
        # SAMPLE_SRC 第 1 行是 `const { Model } = require("sequelize");`
        assert " 1: const { Model }" in body
        # Article.init 在第 6 行
        assert " 6:   Article.init({" in body

    def test_user_message_explains_line_number_usage(self):
        b = PromptBuilder()
        msgs = b.build(_step(), source=SAMPLE_SRC)
        body = msgs[1]["content"]
        # 必须告知 LLM 使用真实行号 + 上下文不带前缀
        assert "真实行号" in body
        assert "NNN:" in body

    def test_empty_source_does_not_break(self):
        b = PromptBuilder()
        # 空源 (新文件 step) 不应抛
        msgs = b.build(_step(), source="")
        # 也不应出现 " 1: " 行号前缀
        assert " 1: " not in msgs[1]["content"]
