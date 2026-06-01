"""schema_sync — 跨栈一致性工具"""

import json
import re
from pathlib import Path

from engine.tool import register_tool
from skills._common import check_sandbox, err


def _extract_model_fields(repo_path: Path, model_file: str) -> dict[str, str]:
    """从 Sequelize 模型中提取字段定义"""
    path = repo_path / model_file
    if not path.exists():
        return {}

    content = path.read_text(encoding="utf-8", errors="ignore")
    fields: dict[str, str] = {}

    # 匹配 DataTypes
    type_map = {
        "STRING": "string", "TEXT": "string", "INTEGER": "integer",
        "BOOLEAN": "boolean", "DATE": "datetime", "DATEONLY": "date",
        "FLOAT": "float", "DOUBLE": "double", "DECIMAL": "decimal",
        "JSON": "json", "ARRAY": "array", "ENUM": "enum",
    }

    for dtype, jstype in type_map.items():
        pattern = rf'\b{dtype}\b'
        if re.search(pattern, content):
            for match in re.finditer(rf'([a-zA-Z_]+)\s*:\s*\{{[^}}]*\b{dtype}\b[^}}]*\}}', content):
                field_name = match.group(1)
                fields[field_name] = jstype

    return fields


def schema_sync_check(entity: str) -> str:
    """检查前后端 Schema 一致性"""
    from config import get_conduit_repo_path
    repo_path = Path(get_conduit_repo_path())

    entity_map = {
        "article": ("backend/models/Article.js", ["frontend/src/routes/Article/Article.jsx"]),
        "user": ("backend/models/User.js", ["frontend/src/context/AuthContext.jsx"]),
        "comment": ("backend/models/Comment.js", ["frontend/src/routes/Article/CommentsSection.jsx"]),
    }

    entity_lower = entity.lower()
    if entity_lower not in entity_map:
        known = list(entity_map.keys())
        return err(f"未知实体: {entity}。已知: {', '.join(known)}")

    model_file, frontend_files = entity_map[entity_lower]

    backend_fields = _extract_model_fields(repo_path, model_file)

    results = {
        "entity": entity,
        "backend_model": model_file,
        "backend_fields_count": len(backend_fields),
        "backend_fields": backend_fields,
        "frontend_files": [],
    }

    for ff in frontend_files:
        fpath = repo_path / ff
        if fpath.exists():
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            results["frontend_files"].append({
                "path": ff,
                "exists": True,
                "has_data": bool(content),
            })
        else:
            results["frontend_files"].append({"path": ff, "exists": False})

    return json.dumps(results, ensure_ascii=False, indent=2)


def schema_diff(entity: str) -> str:
    """对比 Schema 变更"""
    from config import get_conduit_repo_path
    repo_path = Path(get_conduit_repo_path())

    entity_map = {
        "article": "backend/models/Article.js",
        "user": "backend/models/User.js",
        "comment": "backend/models/Comment.js",
    }

    entity_lower = entity.lower()
    if entity_lower not in entity_map:
        return err(f"未知实体: {entity}")

    fields = _extract_model_fields(repo_path, entity_map[entity_lower])

    lines = [f"## {entity} Schema 当前字段"]
    for name, dtype in sorted(fields.items()):
        lines.append(f"  - {name}: {dtype}")

    return "\n".join(lines) if fields else err("无法解析模型字段")


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "schema_sync_check",
            "description": "检查前后端 Schema 一致性",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity": {"type": "string", "description": "实体名: article/user/comment"},
                },
                "required": ["entity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schema_diff",
            "description": "对比 Schema 差异",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity": {"type": "string", "description": "实体名: article/user/comment"},
                },
                "required": ["entity"],
            },
        },
    },
]

HANDLERS = {
    "schema_sync_check": schema_sync_check,
    "schema_diff": schema_diff,
}


def register():
    for s in TOOLS:
        name = s["function"]["name"]
        register_tool(s, HANDLERS[name])
