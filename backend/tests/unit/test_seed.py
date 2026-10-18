"""Seed script: idempotent, and links Supabase users that already exist."""

from sqlalchemy.orm import Session

from app.modules.users import repository
from app.modules.users.models import Role
from scripts.seed import ensure_user
from tests.factories import FakeAuthAdmin


def test_ensure_user_is_idempotent(db: Session, auth_admin: FakeAuthAdmin) -> None:
    for _ in range(2):
        ensure_user(
            db, auth_admin, name="Admin", email="Admin@Example.com", password="pw-123456789", role=Role.ADMIN
        )
    profile = repository.get_by_email(db, "admin@example.com")
    assert profile is not None
    assert profile.role == Role.ADMIN
    assert [name for name, _ in auth_admin.calls] == ["create"]


def test_ensure_user_links_existing_supabase_user(db: Session, auth_admin: FakeAuthAdmin) -> None:
    existing_id = auth_admin.create_user("noura@example.com", "pw-123456789")
    ensure_user(
        db, auth_admin, name="Noura", email="noura@example.com", password="pw-123456789", role=Role.STAFF
    )
    profile = repository.get_by_email(db, "noura@example.com")
    assert profile is not None
    assert profile.auth_user_id == existing_id
