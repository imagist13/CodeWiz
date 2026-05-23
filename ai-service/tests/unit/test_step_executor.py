from pathlib import Path
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.skills.dsl import Step
from app.codemap.scanner import scan_conduit
from app.agents.llm_protocol import FakeLLM
from app.observability.models import Base, LLMCall
from app.observability.llm_recorder import LLMRecorder
from app.harness.step_executor import StepExecutor


FIXTURE = Path(__file__).parent.parent / "fixtures" / "conduit_mini"


@pytest.fixture
def codemap():
    return scan_conduit(str(FIXTURE))


@pytest.fixture
def session_factory():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)


def _viewcount_model_step():
    return Step(
        step_id="s1",
        layer="backend",
        action="edit_sequelize_model",
        dsl={
            "model": "Article",
            "field_name": "viewCount",
            "field_type": "int",
            "default": 0,
        },
        prompt_template="add_field_model",
    )


_MODEL_DIFF = """--- a/backend/db/models/article.js
+++ b/backend/db/models/article.js
@@ -13,4 +13,5 @@
     description: { type: DataTypes.STRING, allowNull: false },
     body: { type: DataTypes.TEXT, allowNull: false },
     slug: { type: DataTypes.STRING, unique: true },
+    viewCount: { type: DataTypes.INTEGER, defaultValue: 0 },
   }, {
"""


class TestStepExecutor:
    async def test_happy_path(self, tmp_path, codemap, session_factory):
        # 把 fixture 拷一份到 tmp_path 作为可写沙箱
        import shutil

        sandbox = tmp_path / "conduit"
        shutil.copytree(str(FIXTURE), str(sandbox))
        cm = scan_conduit(str(sandbox))

        llm = FakeLLM(canned=[_MODEL_DIFF])
        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        exe = StepExecutor(codemap=cm, llm=rec.wrap(llm), sandbox_root=str(sandbox))
        result = await exe.execute(_viewcount_model_step())

        assert result.status == "succeeded"
        # 文件被改了
        article_js = (sandbox / "backend/db/models/article.js").read_text()
        assert "viewCount" in article_js
        # llm_calls 记了一行
        with session_factory() as db:
            rows = db.query(LLMCall).all()
            assert len(rows) == 1

    async def test_retry_once_on_invalid_diff(self, tmp_path, codemap, session_factory):
        import shutil

        sandbox = tmp_path / "conduit"
        shutil.copytree(str(FIXTURE), str(sandbox))
        cm = scan_conduit(str(sandbox))

        llm = FakeLLM(canned=["this is not a diff", _MODEL_DIFF])
        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        exe = StepExecutor(codemap=cm, llm=rec.wrap(llm), sandbox_root=str(sandbox))
        result = await exe.execute(_viewcount_model_step())
        assert result.status == "succeeded"
        assert result.retries == 1
        # llm 被调了 2 次 (1 失败 + 1 修正)
        assert len(llm.calls) == 2

    async def test_fail_after_retry_exhausted(self, tmp_path, codemap, session_factory):
        import shutil

        sandbox = tmp_path / "conduit"
        shutil.copytree(str(FIXTURE), str(sandbox))
        cm = scan_conduit(str(sandbox))

        llm = FakeLLM(canned=["nope1", "nope2"])  # 两次都不是 diff
        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        exe = StepExecutor(codemap=cm, llm=rec.wrap(llm), sandbox_root=str(sandbox))
        result = await exe.execute(_viewcount_model_step())
        assert result.status == "failed"
        assert "diff" in (result.error or "").lower()

    async def test_codemap_miss_fails_fast(self, tmp_path, codemap, session_factory):
        import shutil

        sandbox = tmp_path / "conduit"
        shutil.copytree(str(FIXTURE), str(sandbox))
        cm = scan_conduit(str(sandbox))

        bad_step = Step(
            step_id="s1",
            layer="backend",
            action="edit_sequelize_model",
            dsl={
                "model": "Unicorn",
                "field_name": "x",
                "field_type": "int",
                "default": 0,
            },
            prompt_template="add_field_model",
        )
        llm = FakeLLM(canned=[])  # 不应被调
        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        exe = StepExecutor(codemap=cm, llm=rec.wrap(llm), sandbox_root=str(sandbox))
        result = await exe.execute(bad_step)
        assert result.status == "failed"
        assert len(llm.calls) == 0  # 失败在 resolver, 没花 LLM

    async def test_new_file_step_uses_diff_header_path(
        self, tmp_path, codemap, session_factory
    ):
        import shutil

        sandbox = tmp_path / "conduit"
        shutil.copytree(str(FIXTURE), str(sandbox))
        cm = scan_conduit(str(sandbox))

        # gen_migration is a new-file step; diff header decides filename
        new_file_diff = (
            "--- /dev/null\n"
            "+++ b/backend/db/migrations/2026-add-viewcount.js\n"
            "@@ -0,0 +1,2 @@\n"
            "+exports.up = async () => {};\n"
            "+exports.down = async () => {};\n"
        )
        llm = FakeLLM(canned=[new_file_diff])
        rec = LLMRecorder(
            session_factory=session_factory, session_id="s1", model="ep-X"
        )
        exe = StepExecutor(codemap=cm, llm=rec.wrap(llm), sandbox_root=str(sandbox))
        step = Step(
            step_id="s1",
            layer="backend",
            action="gen_migration",
            dsl={
                "model": "Article",
                "field_name": "viewCount",
                "field_type": "int",
                "default": 0,
            },
            prompt_template="add_field_migration",
        )
        result = await exe.execute(step)
        assert result.status == "succeeded"
        target = sandbox / "backend/db/migrations/2026-add-viewcount.js"
        assert target.exists()
        assert "exports.up" in target.read_text()
        # result.target_path should be the actual file, not the dir
        assert result.target_path == "backend/db/migrations/2026-add-viewcount.js"
