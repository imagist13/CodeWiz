from dataclasses import dataclass, field
from typing import Optional, Dict


@dataclass
class SkillMetadata:
    name: str
    description: str
    path: str
    strict_references: bool = False


@dataclass
class SkillBody:
    when_to_use: Optional[str] = None
    how_it_works: Optional[str] = None
    examples: Optional[str] = None
    anti_patterns: Optional[str] = None
    raw_content: Optional[str] = None


@dataclass
class LoadedSkill:
    metadata: SkillMetadata
    body: Optional[SkillBody] = None
    scripts: Dict[str, str] = field(default_factory=dict)
    references: Dict[str, str] = field(default_factory=dict)
    assets: Dict[str, str] = field(default_factory=dict)
