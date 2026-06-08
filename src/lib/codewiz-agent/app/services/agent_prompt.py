from typing import Optional

from app.core.config import get_settings
from app.tools.registry import tool_registry
from app.skills.manager import skill_manager


def build_system_prompt(user_id: Optional[str] = None) -> str:
    """Build system prompt from AGENT.md + current enabled tools/skills list."""
    settings = get_settings()

    # Read AGENT.md
    try:
        with open(settings.agent_md_path, "r", encoding="utf-8") as f:
            template = f.read()
    except Exception:
        # Fallback if AGENT.md is missing
        template = (
            "You are a tool-based Agent. You can ONLY use the tools and skills listed below.\n\n"
            "If the user's request is unrelated to these tools or skills, you MUST refuse "
            "and tell them what you can do.\n\n"
            "Available tools:\n{tools}\n\n"
            "Available skills (call load_skill to activate):\n{skills}\n"
        )

    # Build tools description
    all_configs = tool_registry.list_tools(user_id or "")
    enabled_configs = [c for c in all_configs if c.get("enabled")]
    if enabled_configs:
        lines = []
        for cfg in sorted(enabled_configs, key=lambda x: x["name"]):
            name = cfg["name"]
            tool_type = cfg.get("type", "agent").upper()
            desc = cfg.get("description", "No description")
            lines.append(f"- {name} [{tool_type}]: {desc}")
        tools_text = "\n".join(lines)
    else:
        tools_text = "（当前没有可用工具）"

    # Build skills description
    all_skills = skill_manager.discovery.list_metadata()
    if all_skills:
        lines = []
        for meta in sorted(all_skills, key=lambda x: x.name):
            lines.append(f"- {meta.name}: {meta.description}")
        skills_text = "\n".join(lines)
    else:
        skills_text = "（当前没有可用 Skill）"

    return template.replace("{tools}", tools_text).replace("{skills}", skills_text)
