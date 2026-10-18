"""Request/response schemas for users. Validation messages match the frontend's mock API."""

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.common.schemas import Schema
from app.modules.users.models import Role

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ROLES = {role.value for role in Role}


class UserOut(Schema):
    id: int
    name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime
    last_active_at: datetime | None


def _clean_name(value: str | None) -> str | None:
    if value is None:
        return None
    name = value.strip()
    if not name:
        raise ValueError("Enter the person’s name.")
    return name


def _clean_email(value: str | None) -> str | None:
    if value is None:
        return None
    email = value.strip().lower()
    if not EMAIL_PATTERN.match(email):
        raise ValueError("Enter a valid email address.")
    return email


def _check_role(value: object) -> object:
    if value not in ROLES:
        raise ValueError("Choose a role.")
    return value


class UserCreate(BaseModel):
    # Defaults are validated too, so a missing field gets the same message as an empty one.
    name: str = Field(default="", validate_default=True)
    email: str = Field(default="", validate_default=True)
    role: Role = Field(default=None, validate_default=True)  # type: ignore[assignment]
    # Length is checked in the service so it can return the WEAK_PASSWORD code.
    password: str = ""

    _name = field_validator("name")(_clean_name)
    _email = field_validator("email")(_clean_email)
    _role = field_validator("role", mode="before")(_check_role)


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    role: Role | None = None
    is_active: bool | None = None

    _name = field_validator("name")(_clean_name)
    _email = field_validator("email")(_clean_email)

    @field_validator("role", mode="before")
    @classmethod
    def _role(cls, value: object) -> object:
        return None if value is None else _check_role(value)
