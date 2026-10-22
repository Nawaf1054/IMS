"""Queries for the `ai_requests` table (the AI rate limit's bookkeeping). This is the only SQL in the
AI module, and it never touches business data; the assistant reads that through `tools.py`."""

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.modules.ai.models import AiRequest


def request_times_since(db: Session, user_id: int, since: datetime) -> list[datetime]:
    """When the user's counted requests after `since` were made, oldest first."""
    return list(
        db.scalars(
            select(AiRequest.created_at)
            .where(AiRequest.user_id == user_id, AiRequest.created_at > since)
            .order_by(AiRequest.created_at)
        )
    )


def add(db: Session, user_id: int, kind: str, created_at: datetime) -> None:
    """Records one successful request."""
    db.add(AiRequest(user_id=user_id, kind=kind, created_at=created_at))


def delete_before(db: Session, user_id: int, before: datetime) -> None:
    """Drops the user's rows that no longer count, so the table stays small."""
    db.execute(delete(AiRequest).where(AiRequest.user_id == user_id, AiRequest.created_at <= before))
