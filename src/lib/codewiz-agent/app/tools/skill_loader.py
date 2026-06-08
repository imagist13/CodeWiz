import json
from app.tools.registry import tool_registry
from app.skills.manager import skill_manager


@tool_registry.register(
    name="load_skill",
    description=(
        "加载指定 Skill 的完整内容（包括工作流程、规则、示例等）。"
        "当你根据 system prompt 中的 skill 描述判断需要使用某个 skill 时，调用此工具加载其详细指令。"
        "加载后内容会加入对话上下文。"
    ),
    tool_type="function",
    parameters={
        "type": "object",
        "properties": {
            "skill_name": {
                "type": "string",
                "description": "Skill 名称（如 hv-profile-creator-coach）",
            }
        },
        "required": ["skill_name"],
    },
)
def load_skill(skill_name: str) -> str:
    """Load a skill's full content (body + references list) and return it as formatted text."""
    metadata = skill_manager.discovery.get_metadata(skill_name)
    if not metadata:
        available = [s.name for s in skill_manager.discovery.list_metadata()]
        return json.dumps(
            {"error": f"Skill '{skill_name}' not found", "available_skills": available},
            ensure_ascii=False,
        )

    loaded = skill_manager.activation.load_full(metadata)
    if not loaded:
        return json.dumps(
            {"error": f"Failed to load skill '{skill_name}'"},
            ensure_ascii=False,
        )

    skill_manager.load_skill_resources(loaded)

    parts = [f"=== SKILL: {loaded.metadata.name} ===\n"]

    if loaded.body:
        if loaded.body.raw_content:
            parts.append(loaded.body.raw_content)
        else:
            if loaded.body.when_to_use:
                parts.append(f"## When to Use\n{loaded.body.when_to_use}")
            if loaded.body.how_it_works:
                parts.append(f"## How It Works\n{loaded.body.how_it_works}")
            if loaded.body.examples:
                parts.append(f"## Examples\n{loaded.body.examples}")
            if loaded.body.anti_patterns:
                parts.append(f"## Anti-Patterns\n{loaded.body.anti_patterns}")

    if loaded.references:
        if loaded.metadata.strict_references:
            parts.append(
                "\n[VERBATIM RULE] Before proceeding, you MUST call the `read_local_file` "
                "tool to load the reference file(s) listed below. The returned content becomes your "
                "SOLE AUTHORITATIVE SOURCE. You MUST use the exact wording and order from the "
                "loaded content. Do NOT rephrase, reorder, skip, or add any content. "
                "Once loaded, the content stays in the conversation context — do NOT call the tool again."
            )
            parts.append("## Available Reference Files (call `read_local_file` to load)")
            for ref_name in loaded.references.keys():
                parts.append(f'- skill_name="{loaded.metadata.name}" file_name="{ref_name}"')
        else:
            parts.append("## References")
            for ref_name, ref_content in loaded.references.items():
                truncated = ref_content[:8000]
                parts.append(f'<reference name="{ref_name}">\n{truncated}\n</reference>')

    if loaded.assets:
        parts.append("## Assets")
        for asset_name, asset_content in loaded.assets.items():
            parts.append(f"### {asset_name}\n{asset_content[:2000]}")

    parts.append("=== END SKILL ===")
    return "\n\n".join(parts)
