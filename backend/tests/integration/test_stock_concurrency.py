"""STK-3 / STK-4 under concurrency: the product row lock serialises stock changes.

These tests commit for real (two connections must see the same rows), so they create and clean
up their own data instead of using the rolled-back `db` fixture.
"""

import threading
import uuid
from collections.abc import Iterator
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select

from app.core.exceptions import Conflict
from app.db.session import SessionLocal
from app.modules.categories.models import Category
from app.modules.products import service as products_service
from app.modules.products.models import Product
from app.modules.stock import service
from app.modules.stock.models import MovementType, StockMovement
from app.modules.stock.schemas import MovementCreate
from app.modules.users.models import Profile, Role


@pytest.fixture
def last_unit() -> Iterator[tuple[int, int]]:
    """A committed product with one unit left, and a user. Yields (product_id, user_id)."""
    tag = uuid.uuid4().hex[:8]
    with SessionLocal() as s:
        user = Profile(
            auth_user_id=uuid.uuid4(), name="Racer", email=f"race-{tag}@example.com", role=Role.STAFF
        )
        category = Category(name=f"Race {tag}")
        s.add_all([user, category])
        s.flush()
        product = Product(
            name="Last unit",
            sku=f"RACE-{tag}".upper(),
            category_id=category.id,
            cost_price=Decimal("1"),
            sell_price=Decimal("2"),
            quantity=1,
        )
        s.add(product)
        s.commit()
        ids = (product.id, user.id, category.id)
    yield ids[0], ids[1]
    with SessionLocal() as s:
        s.execute(delete(StockMovement).where(StockMovement.product_id == ids[0]))
        s.execute(delete(Product).where(Product.id == ids[0]))
        s.execute(delete(Category).where(Category.id == ids[2]))
        s.execute(delete(Profile).where(Profile.id == ids[1]))
        s.commit()


def test_two_removals_cannot_sell_the_last_unit_twice(last_unit: tuple[int, int]) -> None:
    product_id, user_id = last_unit
    outcome: dict[str, str] = {}

    def remove_one() -> None:
        with SessionLocal() as s:
            user = s.get_one(Profile, user_id)
            data = MovementCreate(product_id=product_id, type=MovementType.OUT, quantity=1, note="second")
            try:
                service.record_movement(s, user, data)
                outcome["second"] = "recorded"
            except Conflict as exc:
                outcome["second"] = exc.code

    first = SessionLocal()
    try:
        product = products_service.get_for_update(first, product_id)  # holds the row lock

        second = threading.Thread(target=remove_one, daemon=True)
        second.start()
        second.join(timeout=0.5)
        assert second.is_alive(), "the second removal should wait for the first one's lock"

        user = first.get_one(Profile, user_id)
        service.apply(first, product, MovementType.OUT, -1, note="first", user=user)
        first.commit()
    finally:
        first.close()

    second.join(timeout=10)
    assert outcome == {"second": "INSUFFICIENT_STOCK"}
    with SessionLocal() as s:
        assert s.get_one(Product, product_id).quantity == 0
        count = s.scalar(select(func.count()).where(StockMovement.product_id == product_id))
        assert count == 1
