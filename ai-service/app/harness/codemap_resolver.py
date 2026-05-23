"""把 Step 的抽象目标（model="Article"）翻译成具体文件路径。

step.action 决定查 CodeMap 的哪一类:
  - edit_sequelize_model / add_jsdoc_typedef         → models[model]
  - gen_migration / gen_idempotency_table_migration  → migrations_dir/new
  - update_route_response / add_default_list_filter
    / add_idempotency_check_middleware                → routes[GET /api/...]
  - update_mock_data / update_api_call               → 推断 frontend api 入口
  - inject_form_input / inject_form_input_jsx
    / wire_state_setter                              → components[component]
  - inject_display / inject_button_jsx / wire_api_call
    / add_disabled_state / inject_status_selector
    / inject_computed_display / add_compute_util     → components[component]
  - gen_unit_test                                    → test_dir/new
"""

from typing import Optional
from pydantic import BaseModel

from app.codemap.scanner import CodeMap
from app.skills.dsl import Step


class ResolveError(Exception):
    pass


# FIXME(sprint-2): 新 Pattern 加新 action 时需要在此表加一行映射。
# 触发返工: 写新 Pattern (如 add_websocket_handler) 跑 step_executor 抛 ResolveError。
# 改法: 在下面字典加 ("action_name", (strategy, dsl_key)) 一行即可, 不改 resolver
# 主体逻辑。
_ACTION_TO_KIND = {
    # model 类
    "edit_sequelize_model": ("models", "model"),
    "add_jsdoc_typedef": ("models", "model"),
    # route 类
    "update_route_response": ("routes_for_model", "model"),
    "add_default_list_filter": ("routes_for_model", "model"),
    "add_idempotency_check_middleware": ("routes_for_model", "model"),
    # component 类
    "inject_display": ("components", "component"),
    "inject_computed_display": ("components", "component"),
    "add_compute_util": ("components", "component"),
    "inject_button_jsx": ("components", "component"),
    "wire_api_call": ("components", "component"),
    "add_disabled_state": ("components", "component"),
    "inject_form_input": ("components", "component"),
    "inject_form_input_jsx": ("components", "component"),
    "wire_state_setter": ("components", "component"),
    "inject_status_selector": ("components", "component"),
    # 新文件类
    "gen_migration": ("new_in_migrations", None),
    "gen_idempotency_table_migration": ("new_in_migrations", None),
    "gen_unit_test": ("new_in_tests", None),
    # 前端 API/mock 入口（MVP 用约定路径, 不依赖 codemap）
    "update_mock_data": ("frontend_path", "frontend/src/services/mock.js"),
    "update_api_call": ("frontend_path", "frontend/src/services/articles.js"),
}


class ResolvedStep(BaseModel):
    step_id: str
    layer: str
    action: str
    dsl: dict
    prompt_template: str
    target_path: str
    target_lines: Optional[tuple] = None
    is_new_file: bool = False  # True: target_path is parent dir, exact filename comes from LLM diff header


class CodeMapResolver:
    def __init__(self, codemap: CodeMap):
        self._cm = codemap

    def resolve(self, step: Step) -> ResolvedStep:
        if step.action not in _ACTION_TO_KIND:
            raise ResolveError(f"unknown action: {step.action}")
        strategy, dsl_key = _ACTION_TO_KIND[step.action]

        target_path: str
        target_lines: Optional[tuple] = None
        is_new_file: bool = False

        if strategy == "models":
            model = step.dsl.get(dsl_key)
            if model is None:
                raise ResolveError(f"step.dsl missing key {dsl_key!r}")
            try:
                ref = self._cm.find("models", model)
            except KeyError as e:
                raise ResolveError(str(e)) from e
            target_path = ref.file
            target_lines = (max(ref.line - 5, 1), ref.line + 30)

        elif strategy == "components":
            comp = step.dsl.get(dsl_key)
            if comp is None:
                raise ResolveError(f"step.dsl missing key {dsl_key!r}")
            try:
                ref = self._cm.find("components", comp)
            except KeyError as e:
                raise ResolveError(str(e)) from e
            target_path = ref.file
            target_lines = (1, 80)  # 整组件文件较短, 给个宽松窗口

        elif strategy == "routes_for_model":
            model = step.dsl.get(dsl_key)
            if model is None:
                raise ResolveError(f"step.dsl missing key {dsl_key!r}")
            # 找 model 复数形式的 GET /api/<plural>
            plural = (model + "s").lower()
            key = f"GET /api/{plural}"
            try:
                ref = self._cm.find("routes", key)
            except KeyError as e:
                raise ResolveError(
                    f"no route {key!r} in CodeMap (try check pluralization)"
                ) from e
            target_path = ref.file
            target_lines = (max(ref.line - 2, 1), ref.line + 20)

        elif strategy == "new_in_migrations":
            target_path = self._cm.migrations_dir.replace(
                self._cm.repo_root.rstrip("/") + "/", ""
            )
            if target_path == self._cm.migrations_dir:
                # codemap.repo_root 是绝对路径, 取 basename 路径
                target_path = "backend/db/migrations"
            is_new_file = True

        elif strategy == "new_in_tests":
            target_path = "tests"
            is_new_file = True

        elif strategy == "frontend_path":
            target_path = dsl_key  # 这里 dsl_key 直接是路径常量

        else:
            raise ResolveError(f"unsupported strategy: {strategy}")

        return ResolvedStep(
            step_id=step.step_id,
            layer=step.layer,
            action=step.action,
            dsl=step.dsl,
            prompt_template=step.prompt_template,
            target_path=target_path,
            target_lines=target_lines,
            is_new_file=is_new_file,
        )
