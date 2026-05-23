"""跨栈代码生成的单一事实源 DSL。

每个 Step 共享同一份 DSL 实例（FieldDef/DisplayDef/ButtonDef），
保证后端 model、迁移、路由、前端组件改动用的是同一份字段定义。
"""

from typing import Literal, Optional, Tuple, Union
from pydantic import BaseModel, Field


_MODEL_NAMES = Literal["Article", "User", "Comment", "Tag"]
_FIELD_TYPES = Literal["int", "string", "bool", "date", "text"]
_LAYERS = Literal["backend", "frontend", "test", "lint", "vcs"]
_POSITIONS = Literal["card_meta", "detail_top", "sidebar"]
_HTTP_METHODS = Literal["POST", "DELETE", "PUT", "PATCH"]


class FieldDef(BaseModel):
    model: _MODEL_NAMES
    field_name: str = Field(pattern=r"^[a-z][a-zA-Z0-9]*$")
    field_type: _FIELD_TYPES
    default: Union[int, str, bool, None]
    nullable: bool = True
    indexed: bool = False


class DisplayDef(BaseModel):
    component: str
    binding: str
    icon: Optional[str] = None
    position: _POSITIONS = "card_meta"


class ButtonDef(BaseModel):
    component: str
    label: str
    action_method: _HTTP_METHODS
    action_path: str
    idempotent: bool = False


class Step(BaseModel):
    step_id: str
    layer: _LAYERS
    action: str
    dsl: dict
    target_path: Optional[str] = None
    target_lines: Optional[Tuple[int, int]] = None
    prompt_template: str
