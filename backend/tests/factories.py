"""Test data builders, token signing and an in-memory Supabase admin fake."""

import itertools
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

import jwt
from sqlalchemy.orm import Session

from app.common.time import utcnow
from app.core.config import get_settings
from app.modules.auth.supabase_admin import AuthAdminError
from app.modules.categories.models import Category
from app.modules.products.models import Product
from app.modules.users.models import Profile, Role

_counter = itertools.count(1)


def token_claims(sub: uuid.UUID | str, *, expires_in: timedelta = timedelta(minutes=15)) -> dict[str, Any]:
    """Claims shaped like a Supabase access token."""
    now = utcnow()
    return {
        "sub": str(sub),
        "aud": "authenticated",
        "iss": get_settings().supabase_auth_url,
        "role": "authenticated",
        "iat": now,
        "exp": now + expires_in,
    }


def make_token(sub: uuid.UUID | str, *, secret: str | None = None, **overrides: Any) -> str:
    """Signs Supabase-like claims with the HS256 test secret; keyword args override claims."""
    claims = token_claims(sub) | overrides
    return jwt.encode(claims, secret or get_settings().supabase_jwt_secret, algorithm="HS256")


def auth_header(profile: Profile) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(profile.auth_user_id)}"}


def create_profile(
    db: Session,
    *,
    role: Role = Role.STAFF,
    name: str | None = None,
    email: str | None = None,
    is_active: bool = True,
) -> Profile:
    n = next(_counter)
    profile = Profile(
        auth_user_id=uuid.uuid4(),
        name=name or f"User {n}",
        email=(email or f"user{n}@example.com").lower(),
        role=role,
        is_active=is_active,
    )
    db.add(profile)
    # Commit = release this test's savepoint, so later rollbacks inside a request keep it.
    db.commit()
    return profile


def create_category(db: Session, *, name: str | None = None, parent: Category | None = None) -> Category:
    category = Category(name=name or f"Category {next(_counter)}", parent_id=parent.id if parent else None)
    db.add(category)
    db.commit()
    return category


def create_product(
    db: Session,
    *,
    category: Category | None = None,
    name: str | None = None,
    sku: str | None = None,
    cost_price: str = "10.00",
    sell_price: str = "15.00",
    quantity: int = 0,
    min_quantity: int = 0,
    is_active: bool = True,
) -> Product:
    n = next(_counter)
    product = Product(
        name=name or f"Product {n}",
        sku=(sku or f"SKU-{n:04d}").upper(),
        category_id=(category or create_category(db)).id,
        cost_price=Decimal(cost_price),
        sell_price=Decimal(sell_price),
        # Tests may set quantity directly; the API never does (PRD-4).
        quantity=quantity,
        min_quantity=min_quantity,
        is_active=is_active,
    )
    db.add(product)
    db.commit()
    return product


class FakeAuthAdmin:
    """Records calls instead of talking to Supabase. Set `fail_with` to make the next call fail."""

    def __init__(self) -> None:
        self.users: dict[uuid.UUID, dict[str, Any]] = {}
        self.calls: list[tuple[str, Any]] = []
        self.fail_with: AuthAdminError | None = None

    def _maybe_fail(self) -> None:
        if self.fail_with:
            error, self.fail_with = self.fail_with, None
            raise error

    def create_user(self, email: str, password: str) -> uuid.UUID:
        self.calls.append(("create", email))
        self._maybe_fail()
        if any(u["email"] == email for u in self.users.values()):
            raise AuthAdminError("email_exists", "A user with this email address has already been registered")
        auth_user_id = uuid.uuid4()
        self.users[auth_user_id] = {"email": email, "banned": False}
        return auth_user_id

    def update_user(
        self, auth_user_id: uuid.UUID, *, email: str | None = None, banned: bool | None = None
    ) -> None:
        self.calls.append(("update", {"id": auth_user_id, "email": email, "banned": banned}))
        self._maybe_fail()
        user = self.users.setdefault(auth_user_id, {"email": email, "banned": False})
        if email is not None:
            user["email"] = email
        if banned is not None:
            user["banned"] = banned

    def delete_user(self, auth_user_id: uuid.UUID) -> None:
        self.calls.append(("delete", auth_user_id))
        self.users.pop(auth_user_id, None)

    def find_user_id_by_email(self, email: str) -> uuid.UUID | None:
        return next((uid for uid, u in self.users.items() if u["email"] == email), None)
