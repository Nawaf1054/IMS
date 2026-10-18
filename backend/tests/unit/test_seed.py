"""Seed script: idempotent, and links Supabase users that already exist."""

from sqlalchemy.orm import Session

from app.modules.categories import service as categories_service
from app.modules.products import repository as products_repository
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import BusinessSettingsUpdate
from app.modules.users import repository
from app.modules.users.models import Role
from scripts import demo_data
from scripts.seed import ensure_catalog, ensure_settings, ensure_user
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


def test_ensure_catalog_is_idempotent(db: Session) -> None:
    ensure_catalog(db)
    ensure_catalog(db)
    categories = {c.name: c for c in categories_service.list_categories(db)}
    assert len(categories) == len(demo_data.CATEGORIES)
    assert categories["Power Tools"].parent_id == categories["Tools"].id
    drill = products_repository.get_by_sku(db, "TL-PWR-D18")
    assert drill is not None
    assert drill.category.path == "Tools › Power Tools"
    assert drill.quantity == 0
    grinder = products_repository.get_by_sku(db, "TL-PWR-AG115")
    assert grinder is not None and grinder.is_active is False
    assert sum(c.product_count for c in categories.values()) == len(demo_data.PRODUCTS)


def test_ensure_settings_keeps_admin_changes(db: Session) -> None:
    settings_service.update(db, BusinessSettingsUpdate(currency="USD"))
    ensure_settings(db)
    settings = settings_service.read(db)
    assert settings.business_name == "Al Noor Building Supplies"
    assert settings.currency == "USD"
