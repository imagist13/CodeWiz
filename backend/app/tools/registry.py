import json
import sqlite3
from typing import Dict, Callable, Optional
from app.db.database import get_connection, init_db
from app.tools.api_executor import execute_api_tool

PUBLIC_TOOLS = {"read_local_file", "load_skill"}


class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, Callable] = {}
        self._metadata: Dict[str, dict] = {}

    def register(self, name: str, description: str, parameters: Optional[dict] = None, tool_type: str = "agent"):
        def decorator(func: Callable):
            self._tools[name] = func
            self._metadata[name] = {
                "name": name,
                "type": tool_type,
                "description": description,
                "parameters": parameters or {},
            }
            self._persist_tool(name, tool_type, description, parameters or {}, user_id=None)
            return func
        return decorator

    def _persist_tool(self, name: str, tool_type: str, description: str, parameters: dict,
                      config: Optional[dict] = None, user_id: Optional[str] = None):
        try:
            conn = get_connection()
            cursor = conn.cursor()

            # Public tools (user_id IS NULL): skip if already exists to avoid
            # duplicate rows since SQLite composite PK treats NULLs as distinct.
            if user_id is None:
                cursor.execute(
                    "SELECT 1 FROM tool_configs WHERE name = ? AND user_id IS NULL",
                    (name,)
                )
                if cursor.fetchone():
                    conn.close()
                    return

            cursor.execute(
                "INSERT OR REPLACE INTO tool_configs (name, type, description, enabled, parameters, config, user_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                (name, tool_type, description, 1, json.dumps(parameters), json.dumps(config) if config else None, user_id)
            )
            conn.commit()
            conn.close()
        except sqlite3.OperationalError:
            init_db()
            conn = get_connection()
            cursor = conn.cursor()

            if user_id is None:
                cursor.execute(
                    "SELECT 1 FROM tool_configs WHERE name = ? AND user_id IS NULL",
                    (name,)
                )
                if cursor.fetchone():
                    conn.close()
                    return

            cursor.execute(
                "INSERT OR REPLACE INTO tool_configs (name, type, description, enabled, parameters, config, user_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                (name, tool_type, description, 1, json.dumps(parameters), json.dumps(config) if config else None, user_id)
            )
            conn.commit()
            conn.close()

    def create_tool(self, name: str, tool_type: str, description: str, user_id: str,
                    parameters: Optional[dict] = None, config: Optional[dict] = None,
                    enabled: bool = True) -> dict:
        if tool_type not in ('agent', 'api', 'function'):
            raise ValueError(f"Invalid tool type: {tool_type}. Must be 'agent', 'api', or 'function'.")
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO tool_configs (name, type, description, enabled, parameters, config, user_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            (name, tool_type, description, 1 if enabled else 0, json.dumps(parameters) if parameters else None, json.dumps(config) if config else None, user_id)
        )
        conn.commit()
        conn.close()
        return self.get_tool_config(name, user_id)

    def update_tool(self, name: str, new_name: Optional[str] = None, description: Optional[str] = None,
                    parameters: Optional[dict] = None, config: Optional[dict] = None,
                    enabled: Optional[bool] = None, user_id: Optional[str] = None) -> dict:
        conn = get_connection()
        cursor = conn.cursor()

        # Verify ownership (not a public tool)
        if name in PUBLIC_TOOLS:
            conn.close()
            raise ValueError(f"Cannot modify built-in public tool: {name}")

        # Check tool exists for this user
        cursor.execute("SELECT 1 FROM tool_configs WHERE name = ? AND user_id = ?", (name, user_id))
        if not cursor.fetchone():
            conn.close()
            raise ValueError(f"Tool '{name}' not found")

        if new_name is not None and new_name != name:
            cursor.execute("SELECT 1 FROM tool_configs WHERE name = ? AND user_id = ?", (new_name, user_id))
            if cursor.fetchone():
                conn.close()
                raise ValueError(f"Tool name '{new_name}' already exists")

        updates = []
        values = []
        if new_name is not None:
            updates.append("name = ?")
            values.append(new_name)
        if description is not None:
            updates.append("description = ?")
            values.append(description)
        if parameters is not None:
            updates.append("parameters = ?")
            values.append(json.dumps(parameters))
        if config is not None:
            updates.append("config = ?")
            values.append(json.dumps(config))
        if enabled is not None:
            updates.append("enabled = ?")
            values.append(1 if enabled else 0)
        if not updates:
            conn.close()
            return self.get_tool_config(new_name if new_name else name, user_id)
        values.append(name)
        values.append(user_id)
        cursor.execute(
            f"UPDATE tool_configs SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE name = ? AND user_id = ?",
            values
        )
        conn.commit()
        conn.close()
        return self.get_tool_config(new_name if new_name else name, user_id)

    def delete_tool(self, name: str, user_id: str):
        if name in PUBLIC_TOOLS:
            raise ValueError(f"Cannot delete built-in public tool: {name}")
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tool_configs WHERE name = ? AND user_id = ?", (name, user_id))
        conn.commit()
        conn.close()

    def get_tool_config(self, name: str, user_id: str) -> Optional[dict]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM tool_configs WHERE name = ? AND (user_id = ? OR user_id IS NULL) ORDER BY user_id NULLS LAST LIMIT 1",
            (name, user_id)
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        params = row["parameters"]
        config = row["config"]
        try:
            params = json.loads(params) if params else {}
        except Exception:
            params = {}
        try:
            config = json.loads(config) if config else None
        except Exception:
            config = None
        return {
            "name": row["name"],
            "type": row["type"],
            "description": row["description"],
            "enabled": bool(row["enabled"]),
            "parameters": params,
            "config": config,
        }

    def get_tool(self, name: str, user_id: Optional[str] = None) -> Optional[Callable]:
        if not self.is_enabled(name, user_id):
            return None

        tool_config = self.get_tool_config(name, user_id) if user_id else None
        if not tool_config:
            if name in self._tools:
                return self._tools[name]
            return None

        if tool_config["type"] in ("agent", "function"):
            if name in self._tools:
                return self._tools[name]
            return self._create_agent_wrapper(name, tool_config["description"], tool_config.get("parameters"))
        elif tool_config["type"] == "api":
            return self._create_api_wrapper(name, tool_config["config"], tool_config.get("parameters"))

        return None

    def _create_api_wrapper(self, name: str, config: Optional[dict], parameters_schema: Optional[dict] = None) -> Callable:
        def wrapper(**kwargs):
            if set(kwargs.keys()) == {"kwargs"} and isinstance(kwargs.get("kwargs"), dict):
                args = kwargs["kwargs"]
            else:
                args = kwargs

            missing = []
            if parameters_schema and isinstance(parameters_schema, dict):
                required = parameters_schema.get("required", [])
                for field in required:
                    if field not in args or args[field] is None or args[field] == "":
                        missing.append(field)
            if missing:
                props = parameters_schema.get("properties", {}) if parameters_schema else {}
                lines = [f"要使用「{name}」功能，我还需要您补充以下信息："]
                for field in missing:
                    desc = props.get(field, {}).get("description", field) if isinstance(props, dict) else field
                    lines.append(f"  • {field}：{desc}")
                lines.append("\n请提供上述信息后，我立即为您处理。")
                return json.dumps({
                    "need_user_input": True,
                    "message": "\n".join(lines),
                    "missing": missing,
                }, ensure_ascii=False)
            return execute_api_tool(config or {}, args)
        wrapper.__name__ = name
        return wrapper

    def _create_agent_wrapper(self, name: str, description: str, parameters_schema: Optional[dict] = None) -> Callable:
        def wrapper(**kwargs):
            if set(kwargs.keys()) == {"kwargs"} and isinstance(kwargs.get("kwargs"), dict):
                args = kwargs["kwargs"]
            else:
                args = kwargs

            missing = []
            if parameters_schema and isinstance(parameters_schema, dict):
                required = parameters_schema.get("required", [])
                for field in required:
                    if field not in args or args[field] is None or args[field] == "":
                        missing.append(field)
            if missing:
                props = parameters_schema.get("properties", {}) if parameters_schema else {}
                lines = [f"要使用「{name}」功能，我还需要您补充以下信息："]
                for field in missing:
                    desc = props.get(field, {}).get("description", field) if isinstance(props, dict) else field
                    lines.append(f"  • {field}：{desc}")
                lines.append("\n请提供上述信息后，我立即为您处理。")
                return json.dumps({
                    "need_user_input": True,
                    "message": "\n".join(lines),
                    "missing": missing,
                }, ensure_ascii=False)

            return json.dumps({
                "status": "ok",
                "tool": name,
                "message": f"This agent-type tool '{name}' does not require external execution. Please answer the user directly based on the tool description and your own capabilities. DO NOT call this tool again."
            }, ensure_ascii=False)
        wrapper.__name__ = name
        return wrapper

    def list_tools(self, user_id: str) -> list:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM tool_configs WHERE user_id = ? OR user_id IS NULL ORDER BY name",
            (user_id,)
        )
        rows = cursor.fetchall()
        conn.close()

        tools = []
        for row in rows:
            params = row["parameters"]
            config = row["config"]
            try:
                params = json.loads(params) if params else {}
            except Exception:
                params = {}
            try:
                config = json.loads(config) if config else None
            except Exception:
                config = None
            tools.append({
                "name": row["name"],
                "type": row["type"],
                "description": row["description"],
                "enabled": bool(row["enabled"]),
                "parameters": params,
                "config": config,
            })
        return tools

    def is_enabled(self, name: str, user_id: Optional[str] = None) -> bool:
        conn = get_connection()
        cursor = conn.cursor()
        if user_id:
            cursor.execute(
                "SELECT enabled FROM tool_configs WHERE name = ? AND (user_id = ? OR user_id IS NULL) ORDER BY user_id NULLS LAST LIMIT 1",
                (name, user_id)
            )
        else:
            cursor.execute(
                "SELECT enabled FROM tool_configs WHERE name = ? AND user_id IS NULL",
                (name,)
            )
        row = cursor.fetchone()
        conn.close()
        return bool(row["enabled"]) if row else False

    def toggle_tool(self, name: str, user_id: str):
        if name in PUBLIC_TOOLS:
            raise ValueError(f"Cannot toggle built-in public tool: {name}")
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE tool_configs SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP WHERE name = ? AND user_id = ?",
            (name, user_id)
        )
        conn.commit()
        conn.close()

    def get_enabled_tools(self, user_id: Optional[str] = None) -> Dict[str, Callable]:
        conn = get_connection()
        cursor = conn.cursor()
        if user_id:
            cursor.execute(
                "SELECT * FROM tool_configs WHERE enabled = 1 AND (user_id = ? OR user_id IS NULL) ORDER BY name",
                (user_id,)
            )
        else:
            cursor.execute(
                "SELECT * FROM tool_configs WHERE enabled = 1 AND user_id IS NULL ORDER BY name"
            )
        rows = cursor.fetchall()
        conn.close()

        result: Dict[str, Callable] = {}
        for row in rows:
            name = row["name"]
            tool_type = row["type"]
            if tool_type in ("agent", "function"):
                if name in self._tools:
                    result[name] = self._tools[name]
                else:
                    params = row["parameters"]
                    try:
                        params = json.loads(params) if params else {}
                    except Exception:
                        params = {}
                    result[name] = self._create_agent_wrapper(name, row["description"], params)
            elif tool_type == "api":
                config = row["config"]
                params = row["parameters"]
                try:
                    config = json.loads(config) if config else {}
                except Exception:
                    config = {}
                try:
                    params = json.loads(params) if params else {}
                except Exception:
                    params = {}
                result[name] = self._create_api_wrapper(name, config, params)
        return result


tool_registry = ToolRegistry()
