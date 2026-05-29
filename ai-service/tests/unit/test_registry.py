import sys
from pathlib import Path
import textwrap
import pytest
from app.skills.registry import SkillRegistry
from app.skills.base import BusinessSkill


def _write_module(dir_: Path, name: str, body: str) -> None:
    (dir_ / f"{name}.py").write_text(textwrap.dedent(body))


@pytest.fixture
def temp_skills_dir(tmp_path, monkeypatch):
    """造一个临时 skills/ 包含 business/ + patterns/，挂到 sys.path"""
    pkg = tmp_path / "tmpskills"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("")
    biz = pkg / "business"
    biz.mkdir()
    (biz / "__init__.py").write_text("")
    pat = pkg / "patterns"
    pat.mkdir()
    (pat / "__init__.py").write_text("")

    _write_module(
        biz,
        "add_foo",
        """
        from app.skills.base import BusinessSkill
        class AddFooSkill(BusinessSkill):
            name = "add_foo"
            description = "Add Foo"
            trigger_keywords = ["foo"]
            params_schema = {}
            def match(self, intent): return 1.0 if "foo" in intent else 0.0
            def plan(self, params): return []
    """,
    )
    _write_module(
        pat,
        "noop_pattern",
        """
        from app.skills.base import PatternSkill
        class NoopPattern(PatternSkill):
            name = "noop"
            description = "no-op pattern"
            target_symbols = []
            def match(self, intent): return 0.0
            def plan(self, dsl): return []
    """,
    )
    monkeypatch.syspath_prepend(str(tmp_path))
    yield pkg
    for k in list(sys.modules):
        if k.startswith("tmpskills"):
            del sys.modules[k]


class TestRegistry:
    def test_discovers_business_skills(self, temp_skills_dir):
        r = SkillRegistry.discover("tmpskills")
        names = r.business_names()
        assert "add_foo" in names

    def test_discovers_pattern_skills(self, temp_skills_dir):
        r = SkillRegistry.discover("tmpskills")
        names = r.pattern_names()
        assert "noop" in names

    def test_get_business(self, temp_skills_dir):
        r = SkillRegistry.discover("tmpskills")
        skill = r.business("add_foo")
        assert skill.name == "add_foo"

    def test_get_unknown_raises(self, temp_skills_dir):
        r = SkillRegistry.discover("tmpskills")
        with pytest.raises(KeyError):
            r.business("nope")

    def test_all_business_returns_instances(self, temp_skills_dir):
        r = SkillRegistry.discover("tmpskills")
        skills = r.all_business()
        assert len(skills) == 1
        assert all(isinstance(s, BusinessSkill) for s in skills)
