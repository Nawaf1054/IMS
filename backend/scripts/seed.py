"""Creates the admin user (and, with --demo, the demo accounts the README lists).

Safe to run repeatedly: existing profiles are left alone, and a Supabase user that already
exists without a profile is linked rather than recreated.

    uv run python -m scripts.seed           # admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
    uv run python -m scripts.seed --demo    # + demo admin and staff (password demo1234)
"""

import argparse
import logging
import sys
import uuid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.modules.auth.supabase_admin import AuthAdmin, AuthAdminError, get_auth_admin
from app.modules.users import repository
from app.modules.users import service as users_service
from app.modules.users.models import Role

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


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--demo", action="store_true", help="also create the demo accounts")
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
