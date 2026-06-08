import os
from typing import Dict, Optional

from app.skills.models import LoadedSkill


class SkillExecution:
    def load_scripts(self, skill: LoadedSkill) -> Dict[str, str]:
        return self._load_dir_files(skill.metadata.path, "scripts")

    def load_references(self, skill: LoadedSkill) -> Dict[str, str]:
        return self._load_dir_files(skill.metadata.path, "references")

    def load_assets(self, skill: LoadedSkill) -> Dict[str, str]:
        return self._load_dir_files(skill.metadata.path, "assets")

    def _load_dir_files(self, skill_path: str, dir_name: str) -> Dict[str, str]:
        target_dir = os.path.join(skill_path, dir_name)
        if not os.path.isdir(target_dir):
            return {}
        files = {}
        for entry in os.listdir(target_dir):
            file_path = os.path.join(target_dir, entry)
            if os.path.isfile(file_path):
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        files[entry] = f.read()
                except (UnicodeDecodeError, IOError):
                    files[entry] = ""
        return files

    def get_script_path(self, skill: LoadedSkill, script_name: str) -> Optional[str]:
        script_path = os.path.join(skill.metadata.path, "scripts", script_name)
        if os.path.isfile(script_path):
            return script_path
        return None

    def get_asset_path(self, skill: LoadedSkill, asset_name: str) -> Optional[str]:
        asset_path = os.path.join(skill.metadata.path, "assets", asset_name)
        if os.path.isfile(asset_path):
            return asset_path
        return None

    def get_reference_path(self, skill: LoadedSkill, ref_name: str) -> Optional[str]:
        ref_path = os.path.join(skill.metadata.path, "references", ref_name)
        if os.path.isfile(ref_path):
            return ref_path
        return None


skill_execution = SkillExecution()
