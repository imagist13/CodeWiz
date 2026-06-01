from __future__ import annotations

"""Hermes Skills System.

A skill is a directory under skills/ with:
- SKILL.md: description, usage instructions, examples
- tool.py (optional): Python tool implementation registered via @skill_tool

Skill discovery happens at startup via importlib.
"""
import importlib
import importlib.util
import os
import sys
import logging
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

_SKILL_DIR = os.path.dirname(__file__)
_loaded_skills: dict[str, "Skill"] = {}


@dataclass
class Skill:
    name: str
    description: str
    skill_md: str
    tool_module: Optional[Any] = None
    enabled: bool = True
    tags: list[str] = field(default_factory=list)

    def get_system_prompt_addition(self) -> str:
        """Return text to inject into system prompt for this skill."""
        return f"\n\n## Skill: {self.name}\n\n{self.skill_md}"


def _scan_for_skill(entry: Path) -> list[tuple[str, Path]]:
    """Check if a directory contains one or more skills.

    Returns a list of (name, SKILL.md_path) tuples.
    Handles both direct layout (name/SKILL.md) and container layout
    (name/subdir/SKILL.md).
    """
    results = []

    # Direct: name/SKILL.md
    sm = entry / "SKILL.md"
    if sm.exists():
        results.append((entry.name, sm))
        return results  # Container dir takes priority; skip subdirs

    # Container: name/skill_name/SKILL.md (e.g. marketplace/)
    for sub in sorted(entry.iterdir()):
        if sub.is_dir():
            sm2 = sub / "SKILL.md"
            if sm2.exists():
                results.append((sub.name, sm2))

    return results


def _discover_skills() -> dict[str, Skill]:
    """Discover all skills by scanning the skills/ directory (up to 2 levels deep)."""
    skills = {}
    base_dir = Path(_SKILL_DIR)

    if not base_dir.exists():
        return skills

    for entry in sorted(base_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue

        for skill_name, skill_md_path in _scan_for_skill(entry):
            if skill_name in skills:
                log.warning(f"Duplicate skill name: {skill_name}, skipping")
                continue

            try:
                skill_md = skill_md_path.read_text(encoding="utf-8")
            except Exception as e:
                log.warning(f"Failed to read SKILL.md for {skill_name}: {e}")
                skill_md = ""

            # Extract description from first meaningful line (skip frontmatter)
            first_line = ""
            for line in skill_md.strip().split("\n"):
                stripped = line.strip()
                if stripped and not stripped.startswith("---"):
                    first_line = stripped
                    break
            if first_line.startswith("#"):
                description = first_line.lstrip("#").strip()
            else:
                description = skill_name

            # Try to load tool.py (next to SKILL.md)
            tool_module = None
            tool_path = skill_md_path.parent / "tool.py"
            if tool_path.exists():
                try:
                    spec = importlib.util.spec_from_file_location(
                        f"skill_{skill_name}", tool_path
                    )
                    if spec and spec.loader:
                        tool_module = importlib.util.module_from_spec(spec)
                        sys.modules[f"skill_{skill_name}"] = tool_module
                        spec.loader.exec_module(tool_module)
                        log.info(f"Loaded skill tool: {skill_name}")
                except Exception as e:
                    log.warning(f"Failed to load tool.py for {skill_name}: {e}")

            skills[skill_name] = Skill(
                name=skill_name,
                description=description,
                skill_md=skill_md,
                tool_module=tool_module,
            )

    return skills


def load_skills() -> dict[str, Skill]:
    """Load all skills (called at startup)."""
    global _loaded_skills
    _loaded_skills = _discover_skills()
    log.info(f"Loaded {len(_loaded_skills)} skills: {list(_loaded_skills.keys())}")
    return _loaded_skills


def get_skill(name: str) -> Optional[Skill]:
    return _loaded_skills.get(name)


def get_skill_module(name: str):
    """Get the loaded tool module for a skill (for direct function access).

    The module is registered in sys.modules under the key 'skill_{name}'.
    """
    skill = _loaded_skills.get(name)
    if skill and skill.tool_module:
        return skill.tool_module
    return None


def list_skills() -> list[dict[str, Any]]:
    return [
        {
            "name": s.name,
            "description": s.description,
            "enabled": s.enabled,
            "tags": s.tags,
        }
        for s in _loaded_skills.values()
    ]


def reload_skill(name: str) -> bool:
    """Reload a specific skill (hot reload)."""
    global _loaded_skills
    if name in _loaded_skills:
        del _loaded_skills[name]
    skills = _discover_skills()
    if name in skills:
        _loaded_skills[name] = skills[name]
        return True
    return False


def get_all_skill_prompts() -> str:
    """Get concatenated skill instructions for system prompt."""
    parts = []
    for skill in _loaded_skills.values():
        if skill.enabled:
            parts.append(skill.get_system_prompt_addition())
    return "\n".join(parts)
