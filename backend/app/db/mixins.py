"""Reusable columns: integer primary key and UTC timestamps."""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class IdMixin:
    """Adds an integer primary key `id`."""

    id: Mapped[int] = mapped_column(primary_key=True)


class CreatedAtMixin:
    """Adds `created_at`, set by the database when the row is inserted."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TimestampMixin(CreatedAtMixin):
    """Adds `created_at` and `updated_at` (refreshed on every update)."""

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
