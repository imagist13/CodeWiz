"""conduit — Conduit 全栈项目领域技能"""

from pathlib import Path
from typing import Any
import os
from engine.tool import register_tool
from skills._common import check_sandbox, safe_path, err, truncate


def conduit_schema_map(entity: str) -> str:
    """查看后端模型与前端类型的映射关系"""
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())

    mapping: dict[str, dict[str, str]] = {
        "Article": {
            "backend_model": "backend/models/Article.js — slug, title, description, body, createdAt, updatedAt, userId",
            "backend_controller": "backend/controllers/articles.js — allArticles, createArticle, updateArticle",
            "frontend_service": "frontend/src/services/getArticle.js, setArticle.js",
            "frontend_component": "frontend/src/routes/Article/Article.jsx",
            "frontend_type": "Article 类型定义（见 Article.jsx context）",
        },
        "User": {
            "backend_model": "backend/models/User.js — email, username, bio, image, password",
            "backend_controller": "backend/controllers/user.js, users.js",
            "frontend_service": "frontend/src/services/getUser.js, userLogin.js, userSignUp.js",
            "frontend_context": "frontend/src/context/AuthContext.jsx — { headers, isAuth, loggedUser }",
        },
        "Comment": {
            "backend_model": "backend/models/Comment.js — body, articleId, userId",
            "backend_controller": "backend/controllers/comments.js",
            "frontend_service": "frontend/src/services/getComments.js, postComment.js, deleteComment.js",
            "frontend_component": "frontend/src/routes/Article/CommentsSection.jsx",
        },
        "Tag": {
            "backend_model": "backend/models/Tag.js — name (many-to-many with Article via TagList)",
            "backend_controller": "backend/controllers/articles.js — allArticles (tag filter)",
            "frontend_service": "frontend/src/services/getTags.js",
            "frontend_component": "frontend/src/components/PopularTags.jsx, ArticleTags.jsx",
        },
        "Favorites": {
            "backend_model": "backend/models/Article.js — Favorites 多对多关联（自动创建 JoinTable）",
            "backend_controller": "backend/controllers/favorites.js — favoriteToggler",
            "backend_routes": "backend/routes/articles/favorites.js — POST/DELETE /api/articles/:slug/favorite",
            "frontend_service": "frontend/src/services/toggleFav.js",
            "frontend_component": "frontend/src/components/FavButton.jsx",
        },
    }

    entity_lower = entity.lower()
    for key, info in mapping.items():
        if key.lower() in entity_lower or entity_lower in key.lower():
            lines = [f"## {key} Schema 映射"]
            for k, v in info.items():
                lines.append(f"  {k}: {v}")
            return "\n".join(lines)

    keys = list(mapping.keys())
    return f"未知实体: {entity}。已知实体: {', '.join(keys)}"


def conduit_api_tree() -> str:
    """查看完整 API 路由树"""
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())
    routes_file = repo_path / "backend" / "routes"

    if not routes_file.exists():
        return err("路由文件不存在")

    lines = ["## Conduit API 路由树"]
    routes: list[tuple[str, str]] = []

    for route_file in sorted(routes_file.rglob("*.js")):
        if route_file.name == "index.js":
            continue
        rel = route_file.relative_to(routes_file)
        try:
            content = route_file.read_text(encoding="utf-8", errors="ignore")

            import re
            methods = re.findall(r"\.get\(|\.post\(|\.put\(|\.delete\(", content)
            method_count = len(methods)

            endpoints = re.findall(r'["\'](/[^"\']*)["\']', content)
            endpoints = [e for e in endpoints if "/" in e][:3]

            routes.append((str(rel), f"{method_count} 个方法"))
        except Exception:
            routes.append((str(rel), "读取失败"))

    for route, info in routes:
        lines.append(f"  {route}: {info}")

    return "\n".join(lines)


def conduit_entity_trace(entity: str) -> str:
    """追踪实体的前后端完整调用链"""
    from config import get_conduit_repo_path

    repo_path = Path(get_conduit_repo_path())
    entity_lower = entity.lower()

    results = {
        "model": [], "controller": [], "route": [],
        "frontend_service": [], "frontend_component": []
    }

    skip = {"node_modules", "__pycache__", ".git"}
    extensions = (".js", ".jsx", ".ts", ".tsx")

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip]
        rel_root = Path(root).relative_to(repo_path)

        for f in files:
            if not f.endswith(extensions):
                continue
            fpath = Path(root) / f
            rel = str(fpath.relative_to(repo_path))

            try:
                content = fpath.read_text(encoding="utf-8", errors="ignore").lower()
            except Exception:
                continue

            if entity_lower in content:
                category = None
                if "model" in rel or "models/" in rel:
                    category = "model"
                elif "controller" in rel:
                    category = "controller"
                elif "route" in rel or "routes/" in rel:
                    category = "route"
                elif "service" in rel or "services/" in rel:
                    category = "frontend_service"
                elif "component" in rel or "routes/" in rel or "context/" in rel:
                    category = "frontend_component"

                if category:
                    results[category].append(f"{rel}")

    lines = [f"## {entity} 前后端调用链"]
    for cat, files in results.items():
        if files:
            lines.append(f"\n### {cat}")
            for ff in files[:5]:
                lines.append(f"  - {ff}")

    return "\n".join(lines) if any(results.values()) else err(f"未找到实体: {entity}")


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "conduit_schema_map",
            "description": "查看后端字段与前端类型的映射关系",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity": {"type": "string", "description": "实体名（Article, User, Comment, Tag, Favorites）"},
                },
                "required": ["entity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conduit_api_tree",
            "description": "查看完整 API 路由树",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conduit_entity_trace",
            "description": "追踪实体的前后端完整调用链",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity": {"type": "string", "description": "实体名（Article, User, Comment）"},
                },
                "required": ["entity"],
            },
        },
    },
]

HANDLERS = {
    "conduit_schema_map": conduit_schema_map,
    "conduit_api_tree": conduit_api_tree,
    "conduit_entity_trace": conduit_entity_trace,
}


def register():
    for s in TOOLS:
        name = s["function"]["name"]
        register_tool(s, HANDLERS[name])
