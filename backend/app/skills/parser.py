import os
import re
from typing import Tuple, Optional

import yaml

from app.skills.constants import FRONTMATTER_KEYS_REQUIRED
from app.skills.models import SkillMetadata, SkillBody


FRONTMATTER_PATTERN = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
SECTION_PATTERN = re.compile(r"##\s+(\d+\.\s*)?(.+?)\n(.*?)(?=\n##\s+(?:\d+\.\s*)?|$)", re.DOTALL)


def parse_frontmatter(content: str) -> Tuple[Optional[dict], Optional[str]]:
    match = FRONTMATTER_PATTERN.match(content.strip())
    if not match:
        return None, content.strip()
    try:
        frontmatter = yaml.safe_load(match.group(1))
        body = match.group(2).strip()
        return frontmatter, body
    except yaml.YAMLError:
        return None, content.strip()


def validate_frontmatter(frontmatter: dict) -> Tuple[bool, str]:
    if not isinstance(frontmatter, dict):
        return False, "Frontmatter is not a valid YAML mapping"
    for key in FRONTMATTER_KEYS_REQUIRED:
        if key not in frontmatter or not frontmatter[key]:
            return False, f"Missing required frontmatter key: '{key}'"
    return True, ""


def parse_body_sections(body: str) -> SkillBody:
    skill_body = SkillBody(raw_content=body)
    for match in SECTION_PATTERN.finditer(body):
        title = match.group(2).strip()
        content = match.group(3).strip()
        normalized = title.lower().replace(" ", "_").replace("-", "_")
        if normalized in ("when_to_use", "whentouse"):
            skill_body.when_to_use = content
        elif normalized in ("how_it_works", "howitworks"):
            skill_body.how_it_works = content
        elif normalized in ("examples",):
            skill_body.examples = content
        elif normalized in ("anti_patterns", "antipatterns", "limitations"):
            skill_body.anti_patterns = content
    return skill_body


def parse_skill_md(file_path: str) -> Tuple[Optional[SkillMetadata], Optional[SkillBody], str]:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    frontmatter, body = parse_frontmatter(content)
    if frontmatter is None:
        return None, None, "Failed to parse YAML frontmatter"

    valid, error = validate_frontmatter(frontmatter)
    if not valid:
        return None, None, error

    metadata = SkillMetadata(
        name=frontmatter["name"],
        description=frontmatter["description"],
        path=os.path.dirname(file_path),
        strict_references=bool(frontmatter.get("strict_references", False)),
    )
    skill_body = parse_body_sections(body)
    return metadata, skill_body, ""
