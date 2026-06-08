import re
from difflib import SequenceMatcher
from typing import Optional, Tuple, List

from app.skills.models import SkillMetadata, LoadedSkill
from app.skills.parser import parse_skill_md


# 常见中文停用词，不参与关键词匹配
_STOPWORDS = {
    "当", "用户", "需要", "使用", "支持", "能", "输出", "和", "或", "与",
    "的", "了", "在", "是", "我", "有", "个", "为", "及", "等",
    "时", "就", "都", "而", "你", "会", "对", "可以", "进行", "根据",
    "提供", "包含", "以及", "用于", "时候", "建议", "帮助", "请",
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "shall",
    "can", "to", "of", "in", "for", "on", "with", "at", "by",
    "from", "as", "into", "through", "during", "before", "after",
    "above", "below", "between", "under", "again", "further",
    "then", "once", "here", "there", "when", "where", "why",
    "how", "all", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "just", "and", "but", "if", "or",
    "because", "until", "while", "this", "that", "these", "those",
}


def _clean_text(text: str) -> str:
    """Remove stopwords and punctuation, keep CJK + alphanumeric."""
    text = text.lower()
    for sw in sorted(_STOPWORDS, key=len, reverse=True):
        text = text.replace(sw, "")
    return re.sub(r"[^一-鿿\w]", "", text)


def _char_overlap(query: str, description: str) -> float:
    """Return ratio of description chars (after cleaning) found in query."""
    desc_clean = _clean_text(description)
    query_clean = _clean_text(query)
    if not desc_clean:
        return 0.0
    desc_chars = set(desc_clean)
    query_chars = set(query_clean)
    overlap = desc_chars & query_chars
    return len(overlap) / len(desc_chars)


def _jaccard_similarity(a: str, b: str) -> float:
    """Character-level Jaccard similarity."""
    set_a = set(a.lower())
    set_b = set(b.lower())
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union else 0.0


class SkillActivation:
    def __init__(self, default_threshold: float = 0.35):
        self.default_threshold = default_threshold
        self._skill_thresholds: dict = {}

    def set_threshold(self, skill_name: str, threshold: float):
        self._skill_thresholds[skill_name] = threshold

    def get_threshold(self, skill_name: str) -> float:
        return self._skill_thresholds.get(skill_name, self.default_threshold)

    def _similarity(self, a: str, b: str) -> float:
        """Hybrid similarity: char overlap + Jaccard + SequenceMatcher."""
        kw_score = _char_overlap(a, b)
        jaccard_score = _jaccard_similarity(a, b)
        seq_score = SequenceMatcher(None, a.lower(), b.lower()).ratio()
        # Weighted combination: char overlap is most important for CJK
        return max(kw_score * 0.8 + seq_score * 0.2, jaccard_score)

    def match(self, query: str, skills: List[SkillMetadata]) -> Optional[Tuple[SkillMetadata, float]]:
        # Ignore very short queries to prevent trivial greetings from matching
        if len(_clean_text(query)) < 3:
            return None
        best_skill = None
        best_score = 0.0
        for skill in skills:
            score = self._similarity(query, skill.description)
            if score > best_score:
                best_score = score
                best_skill = skill
        if best_skill and best_score >= self.get_threshold(best_skill.name):
            return best_skill, best_score
        return None

    def load_full(self, metadata: SkillMetadata) -> Optional[LoadedSkill]:
        import os
        skill_md_path = os.path.join(metadata.path, "SKILL.md")
        if not os.path.isfile(skill_md_path):
            return None
        meta, body, error = parse_skill_md(skill_md_path)
        if meta is None:
            return None
        return LoadedSkill(metadata=meta, body=body)

    def parse_explicit_command(self, query: str) -> Optional[str]:
        match = re.match(r"^/([a-zA-Z0-9_-]+)(?:\s+(.*))?", query.strip())
        if match:
            return match.group(1)
        return None

    def extract_command_args(self, query: str) -> Tuple[Optional[str], str]:
        match = re.match(r"^/([a-zA-Z0-9_-]+)(?:\s+(.*))?", query.strip())
        if match:
            return match.group(1), (match.group(2) or "")
        return None, query

    def suggest_skills(self, query: str, skills: List[SkillMetadata], top_k: int = 3) -> List[Tuple[str, float]]:
        scored = []
        for skill in skills:
            score = self._similarity(query, skill.description)
            scored.append((skill.name, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]


skill_activation = SkillActivation()
