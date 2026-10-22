"""Test data builders, token signing and an in-memory Supabase admin fake."""

import itertools
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

import jwt
from sqlalchemy.orm import Session

from app.common.time import utcnow
from app.core.config import get_settings
from app.modules.ai.client import AssistantMessage, Message, ToolCall, ToolSpec
from app.modules.auth.supabase_admin import AuthAdminError
from app.modules.categories.models import Category
from app.modules.invoices import service as invoices_service
from app.modules.invoices.models import Invoice
from app.modules.invoices.schemas import InvoiceCreate, InvoiceLineIn
from app.modules.products.models import Product
from app.modules.stock.models import MovementType, StockMovement
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
    """An Authorization header with a valid token for this profile."""
    return {"Authorization": f"Bearer {make_token(profile.auth_user_id)}"}


def create_profile(
    db: Session,
    *,
    role: Role = Role.STAFF,
    name: str | None = None,
    email: str | None = None,
    is_active: bool = True,
) -> Profile:
    """A committed profile; unspecified fields get unique values."""
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
    """A committed category, optionally under `parent`."""
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
    """A committed product; unspecified fields get unique or default values."""
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


def create_movement(
    db: Session,
    product: Product,
    user: Profile,
    *,
    type: MovementType = MovementType.IN,
    quantity: int = 1,
    note: str = "",
    created_at: datetime | None = None,
) -> StockMovement:
    """A movement with a chosen timestamp; keeps the product's quantity and balance in step."""
    product.quantity += quantity
    movement = StockMovement(
        product_id=product.id,
        type=type,
        quantity=quantity,
        balance_after=product.quantity,
        note=note,
        user_id=user.id,
    )
    if created_at is not None:
        movement.created_at = created_at
    db.add(movement)
    db.commit()
    return movement


def create_invoice(
    db: Session,
    user: Profile,
    lines: list[tuple[Product, int]],
    *,
    customer_name: str | None = None,
    discount: str = "0",
    created_at: datetime | None = None,
) -> Invoice:
    """An invoice made through the service (stock checked and reduced), optionally backdated."""
    data = InvoiceCreate(
        customer_name=customer_name,
        discount=discount,
        items=[InvoiceLineIn(product_id=product.id, quantity=quantity) for product, quantity in lines],
    )
    invoice = invoices_service.get(db, invoices_service.create_invoice(db, user, data).id)
    if created_at is not None:
        invoice.created_at = created_at
        db.commit()
    return invoice


class FakeAuthAdmin:
    """Records calls instead of talking to Supabase. Set `fail_with` to make the next call fail."""

    def __init__(self) -> None:
        """Starts with no users, no recorded calls and no pending failure."""
        self.users: dict[uuid.UUID, dict[str, Any]] = {}
        self.calls: list[tuple[str, Any]] = []
        self.fail_with: AuthAdminError | None = None

    def _maybe_fail(self) -> None:
        """Raises the queued failure once, if one was set."""
        if self.fail_with:
            error, self.fail_with = self.fail_with, None
            raise error

    def create_user(self, email: str, password: str) -> uuid.UUID:
        """Adds a user, refusing a duplicate email like Supabase does."""
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
        """Changes the stored email and/or ban flag."""
        self.calls.append(("update", {"id": auth_user_id, "email": email, "banned": banned}))
        self._maybe_fail()
        user = self.users.setdefault(auth_user_id, {"email": email, "banned": False})
        if email is not None:
            user["email"] = email
        if banned is not None:
            user["banned"] = banned

    def delete_user(self, auth_user_id: uuid.UUID) -> None:
        """Removes the user if present."""
        self.calls.append(("delete", auth_user_id))
        self.users.pop(auth_user_id, None)

    def find_user_id_by_email(self, email: str) -> uuid.UUID | None:
        """The id of the user with this email, or None."""
        return next((uid for uid, u in self.users.items() if u["email"] == email), None)


class FakeLLMClient:
    """Stands in for the LLM in every test (tests never call Gemini). `script()` queues replies:
    an AssistantMessage is returned, an exception is raised. Every call is recorded in `calls`."""

    def __init__(self) -> None:
        self.replies: list[AssistantMessage | Exception] = []
        self.calls: list[dict[str, Any]] = []

    def script(self, *replies: AssistantMessage | Exception) -> None:
        """Queues the next replies, in order."""
        self.replies.extend(replies)

    def generate(
        self,
        *,
        system: str,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec] = (),
        json_schema: dict[str, Any] | None = None,
    ) -> AssistantMessage:
        """Returns (or raises) the next scripted reply."""
        self.calls.append(
            {"system": system, "messages": list(messages), "tools": list(tools), "json_schema": json_schema}
        )
        if not self.replies:
            raise AssertionError("FakeLLMClient was called with no scripted reply left")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def llm_text(text: str) -> AssistantMessage:
    """A scripted final answer."""
    return AssistantMessage(text=text)


def llm_tool_call(name: str, call_id: str | None = None, **arguments: Any) -> AssistantMessage:
    """A scripted turn that asks for one tool call."""
    return AssistantMessage(
        tool_calls=(ToolCall(id=call_id or f"call-{next(_counter)}", name=name, arguments=arguments),)
    )
