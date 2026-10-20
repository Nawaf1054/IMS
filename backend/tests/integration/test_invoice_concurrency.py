"""INV-3 / INV-4 under concurrency: invoices can't oversell, and numbers stay unique and gapless.

These tests commit for real (several connections must see the same rows), so they create and clean
up their own data instead of using the rolled-back `db` fixture.
"""

import threading
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.common.time import utcnow
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.session import SessionLocal
from app.modules.categories.models import Category
from app.modules.invoices import numbering, service
from app.modules.invoices.models import Invoice, InvoiceItem, InvoiceSequence
from app.modules.invoices.schemas import InvoiceCreate, InvoiceLineIn
from app.modules.products import service as products_service
from app.modules.products.models import Product
from app.modules.stock import service as stock_service
from app.modules.stock.models import MovementType, StockMovement
from app.modules.users.models import Profile, Role

YEAR = numbering.invoice_year(utcnow(), get_settings().business_tz)


@dataclass
class Shop:
    """Ids of the data the race tests share across threads."""

    user_id: int
    product_ids: list[int]


@pytest.fixture
def shop() -> Iterator[Shop]:
    """A committed user and five products with one unit each; everything is removed afterwards."""
    tag = uuid.uuid4().hex[:8]
    with SessionLocal() as s:
        user = Profile(
            auth_user_id=uuid.uuid4(), name="Racer", email=f"race-{tag}@example.com", role=Role.STAFF
        )
        category = Category(name=f"Race {tag}")
        s.add_all([user, category])
        s.flush()
        products = [
            Product(
                name=f"Unit {i}",
                sku=f"RACE-{tag}-{i}".upper(),
                category_id=category.id,
                cost_price=Decimal("1"),
                sell_price=Decimal("2"),
                quantity=1,
            )
            for i in range(5)
        ]
        s.add_all(products)
        s.commit()
        user_id, category_id, product_ids = user.id, category.id, [p.id for p in products]
    try:
        yield Shop(user_id, product_ids)
    finally:
        with SessionLocal() as s:
            invoice_ids = select(Invoice.id).where(Invoice.user_id == user_id)
            s.execute(delete(StockMovement).where(StockMovement.product_id.in_(product_ids)))
            s.execute(delete(InvoiceItem).where(InvoiceItem.invoice_id.in_(invoice_ids)))
            s.execute(delete(Invoice).where(Invoice.user_id == user_id))
            s.execute(delete(InvoiceSequence).where(InvoiceSequence.year == YEAR))
            s.execute(delete(Product).where(Product.id.in_(product_ids)))
            s.execute(delete(Category).where(Category.id == category_id))
            s.execute(delete(Profile).where(Profile.id == user_id))
            s.commit()


def sell_one(user_id: int, product_id: int) -> str:
    """Sells one unit in its own session; returns the invoice number or the error code."""
    with SessionLocal() as s:
        user = s.get_one(Profile, user_id)
        data = InvoiceCreate(items=[InvoiceLineIn(product_id=product_id, quantity=1)])
        try:
            return service.create_invoice(s, user, data).invoice_number
        except AppError as exc:
            return exc.code


def test_two_invoices_cannot_sell_the_last_unit(shop: Shop) -> None:
    product_id = shop.product_ids[0]
    outcome: list[str] = []

    first = SessionLocal()
    try:
        [product] = products_service.get_many_for_update(first, [product_id]).values()  # holds the lock

        second = threading.Thread(
            target=lambda: outcome.append(sell_one(shop.user_id, product_id)), daemon=True
        )
        second.start()
        second.join(timeout=0.5)
        assert second.is_alive(), "the second invoice should wait for the first one's lock"

        user = first.get_one(Profile, shop.user_id)
        stock_service.apply(first, product, MovementType.OUT, -1, note="sold elsewhere", user=user)
        first.commit()
    finally:
        first.close()

    second.join(timeout=10)
    assert outcome == ["INSUFFICIENT_STOCK"]
    with SessionLocal() as s:
        assert s.get_one(Product, product_id).quantity == 0
        assert s.scalars(select(Invoice).where(Invoice.user_id == shop.user_id)).all() == []


def test_parallel_invoices_get_consecutive_numbers(shop: Shop) -> None:
    start = threading.Barrier(len(shop.product_ids))
    results: list[str] = []
    lock = threading.Lock()

    def run(product_id: int) -> None:
        start.wait()
        number = sell_one(shop.user_id, product_id)
        with lock:
            results.append(number)

    threads = [threading.Thread(target=run, args=(pid,), daemon=True) for pid in shop.product_ids]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert sorted(results) == [numbering.format_number(YEAR, n) for n in range(1, 6)]
