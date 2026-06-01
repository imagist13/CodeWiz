"""Skill 动态加载与注册中心"""

import importlib
import re
import sys
from pathlib import Path
from typing import Any

from engine.tool import clear_tool_registry

# 全局缓存
SKILLS_INFO_CACHE: list[dict] = []


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """解析 YAML frontmatter，返回 (metadata, body)"""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", content, re.DOTALL)
    if not m:
        return {}, content
    yaml_text, body = m.groups()
    meta: dict[str, Any] = {}
    for line in yaml_text.splitlines():
        if ": " in line or ":" in line:
            key, _, val = line.partition(": ")
            if val is None:
                val = line.partition(":")[2].strip()
            meta[key.strip()] = val.strip().strip('"').strip("'")
    return meta, body.strip()


def register_all(
    skills_dir: str | Path | None = None,
    force_reload: bool = False,
    clear_registry: bool = True,
) -> list[dict]:
    """
    扫描 skills/ 目录，加载所有 SKILL.md 并注册工具。

    返回: list[dict] — 每个 skill 的元信息
    """
    global SKILLS_INFO_CACHE

    if skills_dir is None:
        skills_dir = Path(__file__).parent
    skills_dir = Path(skills_dir)

    if clear_registry:
        clear_tool_registry()

    instruction_skills: list[dict] = []

    for skmd in sorted(skills_dir.glob("**/SKILL.md")):
        skill_dir = skmd.parent
        if skill_dir.name.startswith("_"):
            continue

        rel = skill_dir.relative_to(skills_dir)

        # 解析 frontmatter
        try:
            with open(skmd, encoding="utf-8") as f:
                meta, body = _parse_frontmatter(f.read())
        except IOError:
            continue

        name = meta.get("name", rel.name)
        desc = meta.get("description", "")
        skill_type = meta.get("type", "guide")

        # 添加到 sys.path 以便 tool.py 中的相对导入
        d_str = str(skill_dir.resolve())
        if d_str not in sys.path:
            sys.path.insert(0, d_str)

        # 加载 tool.py（如有）
        has_tools = False
        tool_file = skill_dir / "tool.py"
        if tool_file.is_file():
            mod_name = f"skills.{str(rel).replace(chr(92), '_').replace('/', '_').replace('-', '_')}_tool"
            try:
                if force_reload and mod_name in sys.modules:
                    del sys.modules[mod_name]
                spec = importlib.util.spec_from_file_location(mod_name, str(tool_file.resolve()))
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                if hasattr(mod, "register"):
                    mod.register()
                has_tools = True
            except Exception as e:
                print(f"[Skill] 加载失败: {rel}/tool.py — {e}")

        instruction_skills.append({
            "name": name,
            "description": desc,
            "type": skill_type,
            "summary": f"- **{name}** ({skill_type}): {desc}",
            "has_tools": has_tools,
            "body": body,
        })

    SKILLS_INFO_CACHE = instruction_skills
    return instruction_skills


def get_cached_skills_info() -> list[dict]:
    """返回缓存的技能列表（不重新扫描）"""
    global SKILLS_INFO_CACHE
    if not SKILLS_INFO_CACHE:
        return register_all()
    return SKILLS_INFO_CACHE
