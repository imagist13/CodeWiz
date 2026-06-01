import os
from typing import Dict, List, Optional

from app.skills.constants import SKILL_REQUIRED_FILE
from app.skills.models import SkillMetadata
from app.skills.parser import parse_skill_md


class SkillDiscovery:
    def __init__(self, skills_dir: Optional[str] = None):
        if skills_dir is None:
            # discovery.py is at backend/app/skills/discovery.py (or /app/app/skills/ in container)
            # Go up 3 levels to reach the directory that contains the skills/ folder
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            skills_dir = os.path.join(base_dir, "skills")
        self.skills_dir = skills_dir
        self._metadata_cache: Dict[str, SkillMetadata] = {}

    def scan(self) -> List[SkillMetadata]:
        discovered: List[SkillMetadata] = []
        self._conflict = None
        if not os.path.isdir(self.skills_dir):
            return discovered

        seen_paths: Dict[str, str] = {}
        for entry in os.listdir(self.skills_dir):
            skill_path = os.path.join(self.skills_dir, entry)
            if not os.path.isdir(skill_path):
                continue
            skill_md = os.path.join(skill_path, SKILL_REQUIRED_FILE)
            if not os.path.isfile(skill_md):
                continue
            metadata, _, error = parse_skill_md(skill_md)
            if metadata is None:
                continue
            if metadata.name in seen_paths:
                self._conflict = f"Skill name conflict: '{metadata.name}' found in both {seen_paths[metadata.name]} and {metadata.path}"
            seen_paths[metadata.name] = metadata.path
            discovered.append(metadata)

        self._metadata_cache = {m.name: m for m in discovered}
        return discovered

    def get_metadata(self, name: str) -> Optional[SkillMetadata]:
        return self._metadata_cache.get(name)

    def list_metadata(self) -> List[SkillMetadata]:
        return list(self._metadata_cache.values())

    def has_conflict(self) -> Optional[str]:
        if hasattr(self, '_conflict'):
            return self._conflict
        return None


skill_discovery = SkillDiscovery()
