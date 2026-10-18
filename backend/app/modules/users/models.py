"""Profile: the app's view of a Supabase Auth user, with role and active flag."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import CreatedAtMixin, IdMixin


class Role(StrEnum):
    ADMIN = "admin"
    STAFF = "staff"


class Profile(IdMixin, CreatedAtMixin, Base):
    """One row per person who can sign in.

    Credentials live in Supabase Auth (`auth.users`); `auth_user_id` links to it. There is no
    database foreign key because `auth` exists only on Supabase (not in CI's plain Postgres),
    and users are never hard-deleted, only deactivated. Role and `is_active` are checked on
    every request, so changes take effect immediately.
    """

    __tablename__ = "profiles"

    auth_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Stored lower-case, so the unique constraint is case-insensitive.
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="user_role", values_callable=lambda roles: [r.value for r in roles]), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
