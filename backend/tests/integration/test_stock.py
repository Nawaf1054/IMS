"""STK-1 … STK-6: movements change quantity transactionally, never below zero, and are listable."""

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.modules.products.models import Product
from app.modules.stock import repository, service
from app.modules.stock.models import MovementType, StockMovement
from app.modules.stock.schemas import MovementCreate
from app.modules.users.models import Profile
from tests.factories import create_movement, create_product

URL = "/api/v1/stock-movements"


def record(client: TestClient, headers: dict[str, str], product: Product, **body: Any) -> Any:
    """POSTs a movement for `product`."""
    return client.post(URL, json={"product_id": product.id} | body, headers=headers)


def movement_count(db: Session, product: Product) -> int:
    """How many movements the product has."""
    return db.scalar(select(func.count()).where(StockMovement.product_id == product.id)) or 0


def quantity_of(db: Session, product: Product) -> int:
    """The product's current quantity, re-read from the database."""
    db.refresh(product)
    return product.quantity


# ── Recording (STK-1 … STK-4) ───────────────────────────────────────────────


def test_in_adds_stock(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, name="Cement", sku="BM-CEM", quantity=10)
    response = record(client, staff_headers, product, type="IN", quantity=25, note="  Delivery 7712 ")
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body | {"id": None, "created_at": None} == {
        "id": None,
        "product_id": product.id,
        "product_name": "Cement",
        "product_sku": "BM-CEM",
        "type": "IN",
        "quantity": 25,
        "balance_after": 35,
        "note": "Delivery 7712",
        "invoice_id": None,
        "invoice_number": None,
        "user_id": staff.id,
        "user_name": "Staff",
        "created_at": None,
    }
    assert body["created_at"].endswith(("Z", "+00:00"))
    assert quantity_of(db, product) == 35


def test_in_note_is_optional(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db)
    response = record(client, staff_headers, product, type="IN", quantity=3)
    assert response.status_code == 200
    assert response.json()["note"] == ""


def test_out_removes_stock(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, quantity=10)
    response = record(client, staff_headers, product, type="OUT", quantity=4, note="Damaged")
    assert (response.json()["quantity"], response.json()["balance_after"]) == (-4, 6)
    assert quantity_of(db, product) == 6


def test_out_can_empty_stock(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, quantity=4)
    response = record(client, staff_headers, product, type="OUT", quantity=4, note="Expired")
    assert response.status_code == 200
    assert quantity_of(db, product) == 0


def test_stock_never_goes_below_zero(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, quantity=3)
    response = record(client, staff_headers, product, type="OUT", quantity=4, note="Damaged")
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Only 3 in stock. Quantity can’t go below zero.",
        "code": "INSUFFICIENT_STOCK",
    }
    assert quantity_of(db, product) == 3
    assert movement_count(db, product) == 0


@pytest.mark.parametrize(("counted", "change"), [(7, -5), (20, 8), (0, -12)])
def test_adjustment_sets_counted_quantity(
    client: TestClient, db: Session, staff_headers: dict[str, str], counted: int, change: int
) -> None:
    product = create_product(db, quantity=12)
    response = record(client, staff_headers, product, type="ADJUSTMENT", quantity=counted, note="Count")
    assert response.status_code == 200, response.json()
    assert (response.json()["quantity"], response.json()["balance_after"]) == (change, counted)
    assert quantity_of(db, product) == counted


def test_adjustment_must_change_something(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=12)
    response = record(client, staff_headers, product, type="ADJUSTMENT", quantity=12, note="Count")
    assert response.status_code == 422
    assert response.json() == {
        "detail": "The counted quantity matches the system (12).",
        "code": "NO_CHANGE",
    }


@pytest.mark.parametrize(
    ("body", "status", "code", "detail"),
    [
        ({"type": "SALE", "quantity": 1}, 422, "SALE_NOT_ALLOWED", "SALE movements are created automatically by invoices."),
        ({"type": "IN", "quantity": 0}, 422, "INVALID_QUANTITY", "Enter a quantity greater than zero."),
        ({"type": "IN", "quantity": -5}, 422, "INVALID_QUANTITY", "Enter a quantity greater than zero."),
        ({"type": "ADJUSTMENT", "quantity": -1, "note": "x"}, 422, "INVALID_QUANTITY", "Enter a quantity greater than zero."),
        ({"type": "IN", "quantity": 2**31}, 422, "INVALID_QUANTITY", "That quantity is too large."),
        ({"type": "OUT", "quantity": 1, "note": "   "}, 422, "NOTE_REQUIRED", "Add a note explaining this movement."),
        ({"type": "ADJUSTMENT", "quantity": 1}, 422, "NOTE_REQUIRED", "Add a note explaining this movement."),
        ({"type": "IN", "quantity": 2.5}, 422, "VALIDATION_ERROR", "Quantity must be a whole number."),
        ({"type": "IN", "quantity": "5"}, 422, "VALIDATION_ERROR", "Quantity must be a whole number."),
        ({"type": "IN", "quantity": True}, 422, "VALIDATION_ERROR", "Quantity must be a whole number."),
        ({"type": "IN"}, 422, "VALIDATION_ERROR", "Quantity must be a whole number."),
        ({"type": "MOVE", "quantity": 1}, 422, "VALIDATION_ERROR", "Choose a movement type."),
        ({"type": "IN", "quantity": 1, "note": "x" * 1001}, 422, "VALIDATION_ERROR", "Keep the note under 1000 characters."),
    ],
)  # fmt: skip
def test_invalid_movements_are_rejected(
    client: TestClient,
    db: Session,
    staff_headers: dict[str, str],
    body: dict[str, Any],
    status: int,
    code: str,
    detail: str,
) -> None:
    product = create_product(db, quantity=5)
    response = record(client, staff_headers, product, **body)
    assert response.status_code == status
    assert response.json() == {"detail": detail, "code": code}
    assert quantity_of(db, product) == 5
    assert movement_count(db, product) == 0


def test_stock_cannot_exceed_integer_range(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=service.MAX_QUANTITY)
    response = record(client, staff_headers, product, type="IN", quantity=1)
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_QUANTITY"


def test_product_is_required(client: TestClient, staff_headers: dict[str, str]) -> None:
    response = client.post(URL, json={"type": "IN", "quantity": 1}, headers=staff_headers)
    assert response.status_code == 422
    assert response.json() == {"detail": "Choose a product.", "code": "VALIDATION_ERROR"}


def test_unknown_product(client: TestClient, staff_headers: dict[str, str]) -> None:
    response = client.post(
        URL, json={"product_id": 999999, "type": "IN", "quantity": 1}, headers=staff_headers
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Product not found.", "code": "PRODUCT_NOT_FOUND"}


def test_requires_sign_in(client: TestClient, db: Session) -> None:
    product = create_product(db)
    assert client.post(URL, json={"product_id": product.id, "type": "IN", "quantity": 1}).status_code == 401
    assert client.get(URL).status_code == 401
    assert client.get(f"/api/v1/products/{product.id}/movements").status_code == 401


def test_admin_can_record_too(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    product = create_product(db)
    assert record(client, admin_headers, product, type="IN", quantity=1).status_code == 200


def test_movement_and_quantity_commit_together(
    db: Session, staff: Profile, monkeypatch: pytest.MonkeyPatch
) -> None:
    """STK-3: if the movement can't be written, the quantity change is rolled back with it."""
    product = create_product(db, quantity=10)

    def fail(*_: object) -> None:
        raise RuntimeError("insert failed")

    monkeypatch.setattr(repository, "add", fail)
    with pytest.raises(RuntimeError):
        service.record_movement(
            db, staff, MovementCreate(product_id=product.id, type=MovementType.OUT, quantity=4, note="x")
        )
    db.rollback()  # what the request's session does when it closes after an error
    assert quantity_of(db, product) == 10
    assert movement_count(db, product) == 0


def test_movements_are_immutable() -> None:
    """STK-6: no endpoint edits or deletes a movement; corrections are new ADJUSTMENTs."""
    paths = app.openapi()["paths"]
    movement_paths = {path: set(ops) for path, ops in paths.items() if "movements" in path}
    assert movement_paths == {
        "/api/v1/stock-movements": {"get", "post"},
        "/api/v1/products/{product_id}/movements": {"get"},
        # Read-only Excel download (EXP-2).
        "/api/v1/exports/movements": {"get"},
    }


# ── Low stock and product detail (PRD-5) ────────────────────────────────────


def test_movements_drive_the_low_stock_flag(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=10, min_quantity=5)
    product_url = f"/api/v1/products/{product.id}"
    assert client.get(product_url, headers=staff_headers).json()["is_low_stock"] is False

    record(client, staff_headers, product, type="OUT", quantity=5, note="Damaged")
    assert client.get(product_url, headers=staff_headers).json()["is_low_stock"] is True
    low = client.get("/api/v1/products", params={"low_stock": "true"}, headers=staff_headers).json()
    assert [p["id"] for p in low["items"]] == [product.id]

    record(client, staff_headers, product, type="IN", quantity=1)
    assert client.get(product_url, headers=staff_headers).json()["is_low_stock"] is False


def test_product_detail_shows_last_receipt(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db)
    product_url = f"/api/v1/products/{product.id}"
    assert client.get(product_url, headers=staff_headers).json()["last_received_at"] is None

    received = datetime(2026, 10, 1, 9, 30, tzinfo=UTC)
    create_movement(db, product, staff, type=MovementType.IN, quantity=10, created_at=received)
    create_movement(
        db, product, staff, type=MovementType.OUT, quantity=-2, created_at=datetime(2026, 10, 5, tzinfo=UTC)
    )
    last = client.get(product_url, headers=staff_headers).json()["last_received_at"]
    assert datetime.fromisoformat(last) == received


def test_deleting_a_product_removes_its_history(
    client: TestClient, db: Session, staff: Profile, admin_headers: dict[str, str]
) -> None:
    product = create_product(db)
    create_movement(db, product, staff, quantity=5)
    assert client.delete(f"/api/v1/products/{product.id}", headers=admin_headers).json() == {
        "result": "deleted"
    }
    assert movement_count(db, product) == 0


# ── History (STK-5) ─────────────────────────────────────────────────────────


def ids(response: Any) -> list[int]:
    """The movement ids in a list response, in order."""
    return [m["id"] for m in response.json()["items"]]


def at(day: int, hour: int = 12, minute: int = 0) -> datetime:
    """A UTC timestamp in October 2026."""
    return datetime(2026, 10, day, hour, minute, tzinfo=UTC)


def test_list_is_newest_first(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db)
    old = create_movement(db, product, staff, created_at=at(1))
    new = create_movement(db, product, staff, created_at=at(3))
    middle = create_movement(db, product, staff, created_at=at(2))
    same_time = create_movement(db, product, staff, created_at=at(3))
    assert ids(client.get(URL, headers=staff_headers)) == [same_time.id, new.id, middle.id, old.id]


def test_list_filters_by_type_and_product(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    drill, saw = create_product(db), create_product(db)
    drill_in = create_movement(db, drill, staff, type=MovementType.IN, quantity=5, created_at=at(1))
    drill_out = create_movement(db, drill, staff, type=MovementType.OUT, quantity=-1, created_at=at(2))
    saw_in = create_movement(db, saw, staff, type=MovementType.IN, quantity=5, created_at=at(3))

    assert ids(client.get(URL, params={"type": "IN"}, headers=staff_headers)) == [saw_in.id, drill_in.id]
    assert ids(client.get(URL, params={"product_id": drill.id}, headers=staff_headers)) == [
        drill_out.id,
        drill_in.id,
    ]
    both = client.get(URL, params={"product_id": drill.id, "type": "OUT"}, headers=staff_headers)
    assert ids(both) == [drill_out.id]
    assert client.get(URL, params={"type": "MOVE"}, headers=staff_headers).status_code == 422


def test_date_range_uses_business_days(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    """Dates are inclusive days in the business time zone (Asia/Riyadh, UTC+3, in tests)."""
    product = create_product(db)
    before = create_movement(db, product, staff, created_at=at(18, 20, 59))  # Oct 18, 23:59 local
    first = create_movement(db, product, staff, created_at=at(18, 21, 0))  # Oct 19, 00:00 local
    last = create_movement(db, product, staff, created_at=at(19, 20, 59))  # Oct 19, 23:59 local
    after = create_movement(db, product, staff, created_at=at(19, 21, 0))  # Oct 20, 00:00 local

    def listed(**params: str) -> list[int]:
        return ids(client.get(URL, params=params, headers=staff_headers))

    assert listed(start_date="2026-10-19", end_date="2026-10-19") == [last.id, first.id]
    assert listed(start_date="2026-10-19") == [after.id, last.id, first.id]
    assert listed(end_date="2026-10-18") == [before.id]
    assert listed(start_date="2026-10-21") == []
    assert client.get(URL, params={"start_date": "19/10/2026"}, headers=staff_headers).status_code == 422


def test_list_pagination(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db)
    movements = [create_movement(db, product, staff, created_at=at(day)) for day in range(1, 6)]
    response = client.get(URL, params={"page": 2, "page_size": 2}, headers=staff_headers)
    body = response.json()
    assert (body["total"], body["page"], body["page_size"]) == (5, 2, 2)
    assert ids(response) == [movements[2].id, movements[1].id]


def test_product_history(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    drill, saw = create_product(db), create_product(db)
    received = create_movement(db, drill, staff, type=MovementType.IN, quantity=5, created_at=at(1))
    removed = create_movement(db, drill, staff, type=MovementType.OUT, quantity=-1, created_at=at(19, 12))
    create_movement(db, saw, staff, created_at=at(2))
    history_url = f"/api/v1/products/{drill.id}/movements"

    response = client.get(history_url, headers=staff_headers)
    assert response.status_code == 200
    assert ids(response) == [removed.id, received.id]
    assert [m["balance_after"] for m in response.json()["items"]] == [4, 5]
    assert ids(client.get(history_url, params={"type": "IN"}, headers=staff_headers)) == [received.id]
    assert ids(client.get(history_url, params={"start_date": "2026-10-19"}, headers=staff_headers)) == [
        removed.id
    ]


def test_history_of_unknown_product(client: TestClient, staff_headers: dict[str, str]) -> None:
    response = client.get("/api/v1/products/999999/movements", headers=staff_headers)
    assert response.status_code == 404
    assert response.json()["code"] == "PRODUCT_NOT_FOUND"
