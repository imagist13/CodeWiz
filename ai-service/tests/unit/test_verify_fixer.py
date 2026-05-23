from app.agents.verify_fixer import VerifyFixer, FixerRequest
from app.agents.llm_protocol import FakeLLM


def _request(kind="lint"):
    return FixerRequest(
        kind=kind,
        failure_output="""
        ERROR: unused variable 'foo' at line 12
        ERROR: missing semicolon at line 18
        """,
        recent_diffs=["diff --git a/x.js b/x.js\n+const foo = 1;"],
        target_file="backend/db/models/article.js",
        original_file_content="const foo = 1;\nconst bar = 2",
    )


class TestVerifyFixer:
    async def test_returns_fix_diff(self):
        llm = FakeLLM(
            canned=[
                "@@ -1,2 +1,2 @@\n-const foo = 1;\n+const bar = 2;",
            ]
        )
        f = VerifyFixer(llm)
        r = await f.fix(_request())
        assert r.fix_diff.startswith("@@")
        assert "const bar" in r.fix_diff

    async def test_kind_is_passed_in_prompt(self):
        llm = FakeLLM(canned=["@@ ..."])
        f = VerifyFixer(llm)
        await f.fix(_request(kind="test"))
        prompt = llm.calls[0]["messages"]
        assert any("test" in str(m).lower() for m in prompt)

    async def test_failure_output_in_prompt(self):
        llm = FakeLLM(canned=["@@ ..."])
        f = VerifyFixer(llm)
        await f.fix(_request())
        prompt = str(llm.calls[0]["messages"])
        assert "unused variable" in prompt

    async def test_target_file_in_prompt(self):
        llm = FakeLLM(canned=["@@ ..."])
        f = VerifyFixer(llm)
        await f.fix(_request())
        prompt = str(llm.calls[0]["messages"])
        assert "backend/db/models/article.js" in prompt

    async def test_empty_response_returns_empty_diff(self):
        llm = FakeLLM(canned=[""])
        f = VerifyFixer(llm)
        r = await f.fix(_request())
        assert r.fix_diff == ""
        assert r.confidence == 0.0

    async def test_response_with_diff_has_confidence(self):
        llm = FakeLLM(canned=["@@ -1 +1 @@\n-a\n+b"])
        f = VerifyFixer(llm)
        r = await f.fix(_request())
        assert r.confidence > 0.0
