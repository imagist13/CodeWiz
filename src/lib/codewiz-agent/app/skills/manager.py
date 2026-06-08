from typing import Optional, List, Tuple

from app.skills.discovery import SkillDiscovery
from app.skills.activation import SkillActivation
from app.skills.execution import SkillExecution
from app.skills.models import SkillMetadata, LoadedSkill


class SkillManager:
    def __init__(self, skills_dir: Optional[str] = None):
        self.discovery = SkillDiscovery(skills_dir)
        self.activation = SkillActivation()
        self.execution = SkillExecution()
        self._discovered: List[SkillMetadata] = []

    def discover(self) -> List[SkillMetadata]:
        self._discovered = self.discovery.scan()
        conflict = self.discovery.has_conflict()
        if conflict:
            print(f"[SkillManager] Warning: {conflict}")
        print(f"[SkillManager] Discovered {len(self._discovered)} skill(s)")
        for skill in self._discovered:
            print(f"  - {skill.name}: {skill.description}")
        return self._discovered

    def handle_query(self, query: str) -> Tuple[Optional[LoadedSkill], Optional[str], Optional[float]]:
        """
        Process user query through skill framework.
        Returns: (loaded_skill, command_args, match_score)
        """
        if not self._discovered:
            return None, None, None

        # Check explicit command first
        cmd_name, args = self.activation.extract_command_args(query)
        if cmd_name:
            metadata = self.discovery.get_metadata(cmd_name)
            if metadata:
                loaded = self.activation.load_full(metadata)
                if loaded:
                    return loaded, args, 1.0
            return None, args, None

        # Natural language matching
        match_result = self.activation.match(query, self._discovered)
        if match_result:
            metadata, score = match_result
            loaded = self.activation.load_full(metadata)
            if loaded:
                return loaded, query, score

        return None, query, None

    def get_suggestions(self, query: str, top_k: int = 3) -> List[Tuple[str, float]]:
        return self.activation.suggest_skills(query, self._discovered, top_k)

    def load_skill_resources(self, skill: LoadedSkill):
        skill.scripts = self.execution.load_scripts(skill)
        skill.references = self.execution.load_references(skill)
        skill.assets = self.execution.load_assets(skill)


skill_manager = SkillManager()
