"""AiRequest: one successful AI request, kept for the per-user hourly limit (AI-8)."""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import IdMixin


class AiRequestKind(StrEnum):
    """Which AI endpoint the request used."""

    CHAT = "chat"
    INSIGHTS = "insights"
    PRODUCT_DESCRIPTION = "product_description"


class AiRequest(IdMixin, Base):
    """A counted AI request. Failed requests are never stored, so they don't use up the quota."""

    __tablename__ = "ai_requests"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('chat', 'insights', 'product_description')",
            name="kind_known",
        ),
        Index("ix_ai_requests_user_id_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
