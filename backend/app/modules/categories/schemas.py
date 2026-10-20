"""Category request and response schemas. Validation messages are the ones the UI shows."""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class CategoryOut(BaseModel):
    """A category as the API returns it."""

    id: int
    name: str
    parent_id: int | None
    # Products assigned directly to this category.
    product_count: int
    created_at: datetime


def _clean_name(value: str | None) -> str | None:
    """Trims the name and checks it's present and not too long."""
    if value is None:
        return None
    name = value.strip()
    if not name:
        raise ValueError("Enter a name for the category.")
    if len(name) > 80:
        raise ValueError("Keep the name under 80 characters.")
    return name


class CategoryCreate(BaseModel):
    """POST /categories body."""

    name: str = Field(default="", validate_default=True)
    parent_id: int | None = None

    _name = field_validator("name")(_clean_name)


class CategoryUpdate(BaseModel):
    """Omitted fields stay as they are; `parent_id: null` makes it a top-level category."""

    name: str | None = None
    parent_id: int | None = None

    _name = field_validator("name")(_clean_name)
