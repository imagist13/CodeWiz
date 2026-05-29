import pytest
from pydantic import ValidationError
from app.skills.dsl import FieldDef, DisplayDef, ButtonDef, Step


class TestFieldDef:
    def test_minimal_valid(self):
        f = FieldDef(
            model="Article", field_name="viewCount", field_type="int", default=0
        )
        assert f.nullable is True
        assert f.indexed is False

    def test_field_name_must_be_camel_case(self):
        with pytest.raises(ValidationError):
            FieldDef(
                model="Article", field_name="view_count", field_type="int", default=0
            )

    def test_field_name_must_start_lowercase(self):
        with pytest.raises(ValidationError):
            FieldDef(
                model="Article", field_name="ViewCount", field_type="int", default=0
            )

    def test_unknown_model_rejected(self):
        with pytest.raises(ValidationError):
            FieldDef(model="Foo", field_name="bar", field_type="int", default=0)

    def test_unknown_field_type_rejected(self):
        with pytest.raises(ValidationError):
            FieldDef(model="Article", field_name="bar", field_type="json", default=0)


class TestDisplayDef:
    def test_minimal_valid(self):
        d = DisplayDef(component="ArticlePreview", binding="viewCount")
        assert d.position == "card_meta"  # default

    def test_position_enum(self):
        d = DisplayDef(component="X", binding="y", position="sidebar")
        assert d.position == "sidebar"

    def test_invalid_position_rejected(self):
        with pytest.raises(ValidationError):
            DisplayDef(component="X", binding="y", position="footer")


class TestButtonDef:
    def test_minimal_valid(self):
        b = ButtonDef(
            component="CommentCard",
            label="Like",
            action_method="POST",
            action_path="/comments/:id/like",
        )
        assert b.idempotent is False

    def test_idempotent_default(self):
        b = ButtonDef(
            component="X", label="Y", action_method="DELETE", action_path="/x"
        )
        assert b.idempotent is False


class TestStep:
    def test_minimal_valid(self):
        s = Step(
            step_id="abc-123",
            layer="backend",
            action="edit_sequelize_model",
            dsl={"k": "v"},
            prompt_template="add_field_model",
        )
        assert s.target_path is None
        assert s.target_lines is None

    def test_invalid_layer_rejected(self):
        with pytest.raises(ValidationError):
            Step(
                step_id="x", layer="middleware", action="x", dsl={}, prompt_template="x"
            )

    def test_with_target_path(self):
        s = Step(
            step_id="x",
            layer="backend",
            action="x",
            dsl={},
            target_path="backend/db/models/article.js",
            target_lines=(15, 30),
            prompt_template="x",
        )
        assert s.target_lines == (15, 30)
