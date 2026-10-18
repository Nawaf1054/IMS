"""Creates the admin user; with --demo, also the demo accounts, catalog and business settings.

Safe to run repeatedly: existing users, categories (by name) and products (by SKU) are left
alone, and a Supabase user that already exists without a profile is linked, not recreated.

    uv run python -m scripts.seed           # admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
    uv run python -m scripts.seed --demo    # + demo users (password demo1234), catalog, settings
"""

import argparse
import logging
import sys
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.modules.auth.supabase_admin import AuthAdmin, AuthAdminError, get_auth_admin
from app.modules.categories import repository as categories_repository
from app.modules.categories.models import Category
from app.modules.products import repository as products_repository
from app.modules.products.models import Product
from app.modules.settings import repository as settings_repository
from app.modules.users import repository
from app.modules.users import service as users_service
from app.modules.users.models import Role
from scripts import demo_data

logger = logging.getLogger("seed")

DEMO_PASSWORD = "demo1234"
DEMO_USERS = [
    ("Fahad Al-Harbi", "admin@a.com", Role.ADMIN),
    ("Noura Al-Qahtani", "staff@a.com", Role.STAFF),
    ("Majed Al-Otaibi", "majed@alnoor-supplies.sa", Role.STAFF),
]


def ensure_user(
    db: Session, auth_admin: AuthAdmin, *, name: str, email: str, password: str, role: Role
) -> None:
    email = email.lower()
    if repository.get_by_email(db, email):
        logger.info("exists   %s", email)
        return
    auth_user_id: uuid.UUID | None
    try:
        auth_user_id = auth_admin.create_user(email, password)
    except AuthAdminError as exc:
        if exc.code != "email_exists":
            raise
        auth_user_id = auth_admin.find_user_id_by_email(email)
        if auth_user_id is None:
            raise
    users_service.create_profile(db, auth_user_id=auth_user_id, name=name, email=email, role=role)
    db.commit()
    logger.info("created  %s (%s)", email, role.value)


def ensure_catalog(db: Session) -> None:
    by_name: dict[str, Category] = {}
    for name, parent_name in demo_data.CATEGORIES:
        category = categories_repository.get_by_name(db, name)
        if category is None:
            parent_id = by_name[parent_name].id if parent_name else None
            category = categories_repository.add(db, Category(name=name, parent_id=parent_id))
            logger.info("created  category %s", name)
        by_name[name] = category

    for item in demo_data.PRODUCTS:
        sku = str(item["sku"])
        if products_repository.get_by_sku(db, sku):
            continue
        products_repository.add(
            db,
            Product(
                name=str(item["name"]),
                sku=sku,
                category_id=by_name[str(item["category"])].id,
                cost_price=Decimal(str(item["cost"])),
                sell_price=Decimal(str(item["sell"])),
                quantity=0,
                min_quantity=int(str(item["min"])),
                description=str(item.get("description", "")),
                is_active=bool(item.get("active", True)),
            ),
        )
        logger.info("created  product %s", sku)
    db.commit()


def ensure_settings(db: Session) -> None:
    """Fills in settings that were never saved; values an admin changed are kept."""
    missing = {k: v for k, v in demo_data.SETTINGS.items() if k not in settings_repository.get_all(db)}
    settings_repository.upsert(db, missing)
    db.commit()


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--demo", action="store_true", help="also create demo users, catalog and settings")
    args = parser.parse_args()

    settings = get_settings()
    configure_logging("INFO")
    if not settings.seed_admin_password:
        logger.error("Set SEED_ADMIN_PASSWORD in .env first.")
        return 1

    auth_admin = get_auth_admin()
    with SessionLocal() as db:
        ensure_user(
            db,
            auth_admin,
            name=settings.seed_admin_name,
            email=settings.seed_admin_email,
            password=settings.seed_admin_password,
            role=Role.ADMIN,
        )
        if args.demo:
            for name, email, role in DEMO_USERS:
                ensure_user(db, auth_admin, name=name, email=email, password=DEMO_PASSWORD, role=role)
            ensure_settings(db)
            ensure_catalog(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
