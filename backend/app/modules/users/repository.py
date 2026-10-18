"""Database queries for profiles (SQLAlchemy, no business logic)."""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.modules.users.models import Profile


def get(db: Session, profile_id: int) -> Profile | None:
    return db.get(Profile, profile_id)


def get_by_auth_user_id(db: Session, auth_user_id: uuid.UUID) -> Profile | None:
    return db.scalar(select(Profile).where(Profile.auth_user_id == auth_user_id))


def get_by_email(db: Session, email: str) -> Profile | None:
    return db.scalar(select(Profile).where(Profile.email == email.lower()))


def list_query() -> Select[Profile]:
    return select(Profile).order_by(Profile.id)


def add(db: Session, profile: Profile) -> Profile:
    db.add(profile)
    db.flush()
    return profile
