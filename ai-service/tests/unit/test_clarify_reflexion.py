import json
from app.agents.clarify_reflexion import ClarifyReflexion
from app.agents.llm_protocol import FakeLLM


class TestClarifyReflexion:
    async def test_calls_llm_twice_understand_then_critique(self):
        llm = FakeLLM(
            canned=[
                "我的理解：用户想给 Article 加一个阅读量字段",
                json.dumps(
                    {
                        "questions": [
                            "阅读量是登录用户独立累加还是全局累加？",
                            "默认值是 0 还是 null？",
                        ]
                    }
                ),
            ]
        )
        clarify = ClarifyReflexion(llm)
        await clarify.clarify("给文章加阅读量")
        assert len(llm.calls) == 2

    async def test_returns_questions_from_critique(self):
        llm = FakeLLM(
            canned=[
                "理解…",
                json.dumps(
                    {
                        "questions": ["问题 A", "问题 B"],
                    }
                ),
            ]
        )
        clarify = ClarifyReflexion(llm)
        r = await clarify.clarify("intent")
        assert "问题 A" in r.questions
        assert "问题 B" in r.questions

    async def test_empty_questions_when_unambiguous(self):
        llm = FakeLLM(
            canned=[
                "理解…",
                json.dumps({"questions": []}),
            ]
        )
        clarify = ClarifyReflexion(llm)
        r = await clarify.clarify("intent")
        assert r.questions == []

    async def test_critique_field_preserved(self):
        llm = FakeLLM(
            canned=[
                "我对需求的理解是这样: 加 viewCount 字段",
                json.dumps({"questions": ["q1"]}),
            ]
        )
        clarify = ClarifyReflexion(llm)
        r = await clarify.clarify("intent")
        assert "viewCount" in r.understanding

    async def test_malformed_critique_returns_empty_questions(self):
        llm = FakeLLM(
            canned=[
                "理解…",
                "this is not json at all",
            ]
        )
        clarify = ClarifyReflexion(llm)
        r = await clarify.clarify("intent")
        assert r.questions == []  # 解析失败不抛, 走兜底
