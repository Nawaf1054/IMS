"""Database queries for profiles (SQLAlchemy, no business logic)."""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.modules.users.models import Profile


def get(db: Session, profile_id: int) -> Profile | None:
    """The profile with this id, or None."""
    return db.get(Profile, profile_id)


def get_by_auth_user_id(db: Session, auth_user_id: uuid.UUID) -> Profile | None:
    """The profile linked to this Supabase user, or None."""
    return db.scalar(select(Profile).where(Profile.auth_user_id == auth_user_id))


def get_by_email(db: Session, email: str) -> Profile | None:
    """The profile with this email (emails are stored lower-case), or None."""
    return db.scalar(select(Profile).where(Profile.email == email.lower()))


def list_query() -> Select[Profile]:
    """All profiles, oldest first."""
    return select(Profile).order_by(Profile.id)


def add(db: Session, profile: Profile) -> Profile:
    """Stages a new profile and flushes it so it gets an id. Doesn't commit."""
    db.add(profile)
    db.flush()
    return profile
