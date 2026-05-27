"""SkillContract — Skill 声明式契约的 Pydantic 模型 (v3 Task 1)."""

import pytest
from pydantic import ValidationError

from app.skills.contract import SkillContract
from app.skills.acceptance import FileContains


def _ok_acceptance():
    return [FileContains(path="x.js", needle="viewCount")]


class TestSkillContract:
    def test_minimal_valid(self):
        c = SkillContract(
            goal="加 viewCount 字段",
            constraints=["字段名必须 viewCount"],
            forbid=["不要 import 新包"],
            acceptance=_ok_acceptance(),
            candidate_symbols=["Article"],
        )
        assert c.goal == "加 viewCount 字段"
        assert len(c.constraints) == 1
        assert len(c.forbid) == 1
        assert len(c.acceptance) == 1
        assert c.candidate_symbols == ["Article"]

    def test_goal_non_empty_required(self):
        with pytest.raises(ValidationError):
            SkillContract(
                goal="",
                constraints=[],
                forbid=[],
                acceptance=_ok_acceptance(),
                candidate_symbols=[],
            )

    def test_acceptance_must_non_empty(self):
        with pytest.raises(ValidationError):
            SkillContract(
                goal="x",
                constraints=[],
                forbid=[],
                acceptance=[],
                candidate_symbols=[],
            )

    def test_constraints_forbid_candidate_symbols_default_empty(self):
        c = SkillContract(goal="x", acceptance=_ok_acceptance())
        assert c.constraints == []
        assert c.forbid == []
        assert c.candidate_symbols == []

    def test_serializable_to_dict(self):
        c = SkillContract(
            goal="加 viewCount",
            constraints=["a"],
            forbid=["b"],
            acceptance=_ok_acceptance(),
            candidate_symbols=["Article"],
        )
        d = c.model_dump()
        assert d["goal"] == "加 viewCount"
        assert d["acceptance"][0]["needle"] == "viewCount"
