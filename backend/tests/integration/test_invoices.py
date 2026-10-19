"""INV-1 … INV-7: invoices reduce stock atomically, keep their prices, and cancel with reversals."""

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common.time import utcnow
from app.core.config import get_settings
from app.main import app
from app.modules.invoices import numbering, service
from app.modules.invoices.models import Invoice
from app.modules.invoices.schemas import InvoiceCreate, InvoiceLineIn
from app.modules.products.models import Product
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import BusinessSettingsUpdate
from app.modules.stock import service as stock_service
from app.modules.stock.models import StockMovement
from app.modules.users.models import Profile
from tests.factories import create_invoice, create_product

URL = "/api/v1/invoices"
YEAR = numbering.invoice_year(utcnow(), get_settings().business_tz)


def number(sequence: int) -> str:
    return f"INV-{YEAR}-{sequence:05d}"


def set_tax_rate(db: Session, rate: str) -> None:
    settings_service.update(db, BusinessSettingsUpdate(tax_rate=rate))


def sell(client: TestClient, headers: dict[str, str], *lines: tuple[Product, int], **body: Any) -> Any:
    items = [{"product_id": product.id, "quantity": quantity} for product, quantity in lines]
    return client.post(URL, json={"items": items} | body, headers=headers)


def quantity_of(db: Session, product: Product) -> int:
    db.refresh(product)
    return product.quantity


def invoice_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Invoice)) or 0


def movement_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(StockMovement)) or 0


# ── Create (INV-1 … INV-5) ──────────────────────────────────────────────────


def test_create_invoice(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    set_tax_rate(db, "0.15")
    cement = create_product(db, name="Cement", sku="BM-CEM", sell_price="19.00", quantity=100)
    drill = create_product(db, name="Drill", sku="TL-DRL", sell_price="449.50", quantity=5)

    response = sell(
        client, staff_headers, (cement, 10), (drill, 2), customer_name="  Saad Contracting ", discount="50"
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    # subtotal 190 + 899 = 1089; taxable 1039; VAT 155.85; total 1194.85
    assert {k: body[k] for k in ("invoice_number", "customer_name", "item_count", "status", "user_name")} == {
        "invoice_number": number(1),
        "customer_name": "Saad Contracting",
        "item_count": 2,
        "status": "COMPLETED",
        "user_name": "Staff",
    }
    assert (body["subtotal"], body["discount"], body["tax_rate"], body["tax_amount"], body["total"]) == (
        "1089.00",
        "50.00",
        "0.15",
        "155.85",
        "1194.85",
    )
    assert [
        (i["product_name"], i["product_sku"], i["quantity"], i["unit_price"], i["line_total"])
        for i in body["items"]
    ] == [
        ("Cement", "BM-CEM", 10, "19.00", "190.00"),
        ("Drill", "TL-DRL", 2, "449.50", "899.00"),
    ]
    assert (body["cancelled_at"], body["cancelled_by_name"]) == (None, None)

    # INV-4: one SALE movement per line, linked to the invoice; stock reduced.
    assert [
        (m["type"], m["product_id"], m["quantity"], m["balance_after"], m["invoice_number"])
        for m in body["movements"]
    ] == [
        ("SALE", cement.id, -10, 90, number(1)),
        ("SALE", drill.id, -2, 3, number(1)),
    ]
    assert (quantity_of(db, cement), quantity_of(db, drill)) == (90, 3)


def test_walk_in_customer(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, quantity=5)
    assert sell(client, staff_headers, (product, 1), customer_name="   ").json()["customer_name"] is None
    assert sell(client, staff_headers, (product, 1)).json()["customer_name"] is None


def test_tax_is_rounded_half_up(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    set_tax_rate(db, "0.05")
    product = create_product(db, sell_price="0.10", quantity=5)
    body = sell(client, staff_headers, (product, 1)).json()
    assert (body["tax_amount"], body["total"]) == ("0.01", "0.11")  # 0.005 rounds up


def test_tax_rate_is_kept_to_basis_points(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    set_tax_rate(db, "0.08255")
    product = create_product(db, sell_price="100", quantity=5)
    body = sell(client, staff_headers, (product, 1)).json()
    assert (body["tax_rate"], body["tax_amount"]) == ("0.0826", "8.26")


def test_numbers_are_sequential(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, quantity=10)
    next_url = f"{URL}/next-number"
    assert client.get(next_url, headers=staff_headers).json() == {"invoice_number": number(1)}
    assert sell(client, staff_headers, (product, 1)).json()["invoice_number"] == number(1)
    assert sell(client, staff_headers, (product, 1)).json()["invoice_number"] == number(2)
    assert client.get(next_url, headers=staff_headers).json() == {"invoice_number": number(3)}


def test_repeated_products_are_merged(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, sell_price="5", quantity=10)
    body = sell(client, staff_headers, (product, 2), (product, 3)).json()
    assert [(i["quantity"], i["line_total"]) for i in body["items"]] == [(5, "25.00")]
    assert quantity_of(db, product) == 5


def test_prices_are_kept_at_time_of_sale(
    client: TestClient, db: Session, staff_headers: dict[str, str], admin_headers: dict[str, str]
) -> None:
    """INV-5: a later price change doesn't touch old invoices."""
    product = create_product(db, sell_price="20", quantity=5)
    invoice = sell(client, staff_headers, (product, 2)).json()
    client.patch(f"/api/v1/products/{product.id}", json={"sell_price": "99"}, headers=admin_headers)
    again = client.get(f"{URL}/{invoice['id']}", headers=staff_headers).json()
    assert (again["items"][0]["unit_price"], again["total"]) == ("20.00", "40.00")


def test_admin_can_override_price(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    product = create_product(db, sell_price="20", quantity=5)
    items = [{"product_id": product.id, "quantity": 2, "unit_price": "17.5"}]
    body = client.post(URL, json={"items": items}, headers=admin_headers).json()
    assert (body["items"][0]["unit_price"], body["subtotal"]) == ("17.50", "35.00")


def test_staff_cannot_change_prices(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, sell_price="20", quantity=5)
    same = [{"product_id": product.id, "quantity": 1, "unit_price": "20.00"}]
    assert client.post(URL, json={"items": same}, headers=staff_headers).status_code == 200

    changed = [{"product_id": product.id, "quantity": 1, "unit_price": "1"}]
    response = client.post(URL, json={"items": changed}, headers=staff_headers)
    assert response.status_code == 403
    assert response.json() == {"detail": "Only admins can change prices.", "code": "FORBIDDEN"}
    assert quantity_of(db, product) == 4


@pytest.mark.parametrize(
    ("body", "status", "code", "detail"),
    [
        ({"items": []}, 422, "EMPTY_INVOICE", "Add at least one product."),
        ({"discount": "abc"}, 422, "INVALID_DISCOUNT", "Enter the discount as an amount, e.g. 50.00."),
        ({"discount": "-5"}, 422, "INVALID_DISCOUNT", "Enter the discount as an amount, e.g. 50.00."),
        ({"discount": "500"}, 422, "INVALID_DISCOUNT", "Discount can’t exceed the subtotal."),
        ({"quantity": 0}, 422, "INVALID_QUANTITY", "Each line needs a quantity of at least 1."),
        ({"quantity": -2}, 422, "INVALID_QUANTITY", "Each line needs a quantity of at least 1."),
        ({"quantity": 1.5}, 422, "VALIDATION_ERROR", "Each line needs a quantity of at least 1."),
        ({"unit_price": "free"}, 422, "INVALID_PRICE", "Unit prices must be amounts, e.g. 19.00."),
        ({"product_id": 999999}, 404, "PRODUCT_NOT_FOUND", "Product not found."),
        ({"customer_name": "x" * 121}, 422, "VALIDATION_ERROR", "Keep the customer name under 120 characters."),
    ],
)  # fmt: skip
def test_invalid_invoices_are_rejected(
    client: TestClient,
    db: Session,
    admin_headers: dict[str, str],
    body: dict[str, Any],
    status: int,
    code: str,
    detail: str,
) -> None:
    product = create_product(db, sell_price="10", quantity=5)
    line = {"product_id": product.id, "quantity": 2}
    line |= {k: body.pop(k) for k in ("product_id", "quantity", "unit_price") if k in body}
    response = client.post(URL, json={"items": [line]} | body, headers=admin_headers)
    assert response.status_code == status
    assert response.json() == {"detail": detail, "code": code}
    assert (quantity_of(db, product), invoice_count(db)) == (5, 0)


def test_inactive_products_cannot_be_sold(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, name="Old grinder", quantity=5, is_active=False)
    response = sell(client, staff_headers, (product, 1))
    assert response.status_code == 422
    assert response.json() == {
        "detail": "Old grinder is inactive and can’t be sold.",
        "code": "PRODUCT_INACTIVE",
    }


def test_too_large_total(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db, sell_price="9999999999.99", quantity=5)
    response = sell(client, staff_headers, (product, 2))
    assert response.status_code == 422
    assert response.json()["code"] == "AMOUNT_TOO_LARGE"


def test_one_short_line_rejects_the_whole_invoice(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    """INV-4: nothing is saved, stock is untouched and the number isn't used up."""
    cement = create_product(db, quantity=100)
    drill = create_product(db, name="Drill", quantity=1)
    response = sell(client, staff_headers, (cement, 10), (drill, 2))
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Insufficient stock for Drill: only 1 available.",
        "code": "INSUFFICIENT_STOCK",
    }
    assert (quantity_of(db, cement), quantity_of(db, drill)) == (100, 1)
    assert (invoice_count(db), movement_count(db)) == (0, 0)
    assert client.get(f"{URL}/next-number", headers=staff_headers).json()["invoice_number"] == number(1)


def test_failure_while_saving_rolls_everything_back(
    db: Session, staff: Profile, monkeypatch: pytest.MonkeyPatch
) -> None:
    """INV-4: a failure after the invoice and the first SALE movement are written undoes them all."""
    cement, drill = create_product(db, quantity=10), create_product(db, quantity=10)
    real_apply = stock_service.apply
    calls = 0

    def fail_on_second(*args: Any, **kwargs: Any) -> StockMovement:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("database went away")
        return real_apply(*args, **kwargs)

    monkeypatch.setattr(stock_service, "apply", fail_on_second)
    data = InvoiceCreate(items=[InvoiceLineIn(product_id=p.id, quantity=3) for p in (cement, drill)])
    with pytest.raises(RuntimeError):
        service.create_invoice(db, staff, data)
    db.rollback()  # what the request's session does when it closes after an error

    assert (quantity_of(db, cement), quantity_of(db, drill)) == (10, 10)
    assert (invoice_count(db), movement_count(db)) == (0, 0)
    assert service.next_number(db) == number(1)


def test_requires_sign_in(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={}).status_code == 401
    assert client.get(f"{URL}/summary").status_code == 401
    assert client.get(f"{URL}/next-number").status_code == 401


# ── Cancel (INV-6) ──────────────────────────────────────────────────────────


def test_admin_cancels_and_stock_returns(
    client: TestClient, db: Session, staff: Profile, admin_headers: dict[str, str]
) -> None:
    cement, drill = create_product(db, quantity=100), create_product(db, quantity=5)
    invoice = create_invoice(db, staff, [(cement, 10), (drill, 2)])
    response = client.post(f"{URL}/{invoice.id}/cancel", headers=admin_headers)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert (body["status"], body["cancelled_by_name"]) == ("CANCELLED", "Admin")
    assert body["cancelled_at"] is not None
    assert (quantity_of(db, cement), quantity_of(db, drill)) == (100, 5)

    reversal = f"Reversal: {invoice.invoice_number} cancelled"
    assert [(m["type"], m["quantity"], m["balance_after"], m["note"]) for m in body["movements"]] == [
        ("SALE", -10, 90, ""),
        ("SALE", -2, 3, ""),
        ("IN", 10, 100, reversal),
        ("IN", 2, 5, reversal),
    ]


def test_cancel_restores_stock_of_deactivated_products(
    client: TestClient, db: Session, staff: Profile, admin_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=5)
    invoice = create_invoice(db, staff, [(product, 5)])
    product.is_active = False
    db.commit()
    assert client.post(f"{URL}/{invoice.id}/cancel", headers=admin_headers).status_code == 200
    assert quantity_of(db, product) == 5


def test_cancel_only_once(
    client: TestClient, db: Session, staff: Profile, admin_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=5)
    invoice = create_invoice(db, staff, [(product, 1)])
    client.post(f"{URL}/{invoice.id}/cancel", headers=admin_headers)
    response = client.post(f"{URL}/{invoice.id}/cancel", headers=admin_headers)
    assert response.status_code == 409
    assert response.json() == {"detail": "This invoice is already cancelled.", "code": "ALREADY_CANCELLED"}
    assert quantity_of(db, product) == 5


def test_staff_cannot_cancel(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=5)
    invoice = create_invoice(db, staff, [(product, 1)])
    assert client.post(f"{URL}/{invoice.id}/cancel", headers=staff_headers).status_code == 403
    assert quantity_of(db, product) == 4


def test_unknown_invoice(client: TestClient, admin_headers: dict[str, str]) -> None:
    expected = {"detail": "Invoice not found.", "code": "INVOICE_NOT_FOUND"}
    for response in (
        client.get(f"{URL}/999999", headers=admin_headers),
        client.post(f"{URL}/999999/cancel", headers=admin_headers),
        client.get(f"{URL}/999999/pdf", headers=admin_headers),
    ):
        assert (response.status_code, response.json()) == (404, expected)


def test_invoices_cannot_be_edited_or_deleted() -> None:
    """INV-6: the only change after creation is cancelling."""
    invoice_paths = {path: set(ops) for path, ops in app.openapi()["paths"].items() if "/invoices" in path}
    assert invoice_paths == {
        "/api/v1/invoices": {"get", "post"},
        "/api/v1/invoices/summary": {"get"},
        "/api/v1/invoices/next-number": {"get"},
        "/api/v1/invoices/{invoice_id}": {"get"},
        "/api/v1/invoices/{invoice_id}/cancel": {"post"},
        "/api/v1/invoices/{invoice_id}/pdf": {"get"},
    }


# ── List, search and summary (INV-7) ────────────────────────────────────────


def at(day: int, hour: int = 12) -> datetime:
    return datetime(2026, 10, day, hour, tzinfo=UTC)


def numbers(response: Any) -> list[str]:
    return [i["invoice_number"] for i in response.json()["items"]]


@pytest.fixture
def three_invoices(db: Session, staff: Profile) -> list[Invoice]:
    product = create_product(db, sell_price="10", quantity=100)
    return [
        create_invoice(db, staff, [(product, 1)], customer_name="Saad Contracting", created_at=at(1)),
        create_invoice(db, staff, [(product, 2)], created_at=at(18, 21)),  # Oct 19 00:00 in Riyadh
        create_invoice(db, staff, [(product, 3)], customer_name="Al Noor", created_at=at(19, 20)),
    ]


def test_list_is_newest_first(
    client: TestClient, staff_headers: dict[str, str], three_invoices: list[Invoice]
) -> None:
    response = client.get(URL, headers=staff_headers)
    assert numbers(response) == [number(3), number(2), number(1)]
    first = response.json()["items"][0]
    assert first | {"id": None, "created_at": None} == {
        "id": None,
        "invoice_number": number(3),
        "customer_name": "Al Noor",
        "item_count": 1,
        "total": "30.00",
        "status": "COMPLETED",
        "user_name": "Staff",
        "created_at": None,
    }


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"search": "saad"}, [1]),
        ({"search": f"{YEAR}-00002"}, [2]),
        ({"search": "walk-in"}, [2]),
        ({"search": "  "}, [3, 2, 1]),
        ({"start_date": "2026-10-19"}, [3, 2]),
        ({"end_date": "2026-10-18"}, [1]),
        ({"start_date": "2026-10-19", "end_date": "2026-10-19"}, [3, 2]),
        ({"status": "CANCELLED"}, []),
    ],
)
def test_list_filters(
    client: TestClient,
    staff_headers: dict[str, str],
    three_invoices: list[Invoice],
    params: dict[str, str],
    expected: list[int],
) -> None:
    assert numbers(client.get(URL, params=params, headers=staff_headers)) == [number(n) for n in expected]


def test_list_status_filter_and_pagination(
    client: TestClient,
    db: Session,
    admin: Profile,
    admin_headers: dict[str, str],
    three_invoices: list[Invoice],
) -> None:
    service.cancel_invoice(db, admin, three_invoices[0].id)
    assert numbers(client.get(URL, params={"status": "CANCELLED"}, headers=admin_headers)) == [number(1)]
    page = client.get(URL, params={"page": 2, "page_size": 2}, headers=admin_headers)
    assert (page.json()["total"], numbers(page)) == (3, [number(1)])


def test_summary(
    client: TestClient, db: Session, admin: Profile, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, sell_price="10", quantity=100)
    create_invoice(db, staff, [(product, 1)], created_at=at(5))
    create_invoice(db, staff, [(product, 1)], created_at=at(6))
    create_invoice(db, staff, [(product, 2)], created_at=at(7))
    cancelled = create_invoice(db, staff, [(product, 4)], created_at=at(8))
    service.cancel_invoice(db, admin, cancelled.id)
    create_invoice(db, staff, [(product, 9)], created_at=at(20))

    response = client.get(
        f"{URL}/summary", params={"start_date": "2026-10-01", "end_date": "2026-10-10"}, headers=staff_headers
    )
    assert response.json() == {
        "invoice_count": 3,
        "total_sales": "40.00",
        "average_invoice": "13.33",
        "cancelled_count": 1,
        "cancelled_total": "40.00",
    }
    empty = client.get(f"{URL}/summary", params={"start_date": "2030-01-01"}, headers=staff_headers).json()
    assert empty == {
        "invoice_count": 0,
        "total_sales": "0.00",
        "average_invoice": "0.00",
        "cancelled_count": 0,
        "cancelled_total": "0.00",
    }


# ── Products and stock see the sales ────────────────────────────────────────


def test_product_shows_its_sales(
    client: TestClient, db: Session, admin: Profile, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, sell_price="10", quantity=100)
    create_invoice(db, staff, [(product, 3)])
    create_invoice(db, staff, [(product, 2)], discount="5")
    cancelled = create_invoice(db, staff, [(product, 7)])
    service.cancel_invoice(db, admin, cancelled.id)
    create_invoice(db, staff, [(product, 50)], created_at=datetime(2020, 1, 1, tzinfo=UTC))  # long ago

    body = client.get(f"/api/v1/products/{product.id}", headers=staff_headers).json()
    assert body["invoice_count"] == 4
    assert body["sales_last_30_days"] == {
        "quantity": 5,
        "revenue": "50.00",
        "invoice_count": 2,
        "cancelled_count": 1,
    }
    # Line revenue, before the invoice discount; the cancellation's IN isn't a receipt.
    assert body["last_received_at"] is None
    listed = client.get("/api/v1/products", params={"search": product.sku}, headers=staff_headers).json()
    assert listed["items"][0]["invoice_count"] == 4


def test_sold_products_are_deactivated_not_deleted(
    client: TestClient, db: Session, staff: Profile, admin_headers: dict[str, str]
) -> None:
    """PRD-2."""
    product = create_product(db, quantity=5)
    create_invoice(db, staff, [(product, 1)])
    response = client.delete(f"/api/v1/products/{product.id}", headers=admin_headers)
    assert response.json() == {"result": "deactivated"}
    db.refresh(product)
    assert product.is_active is False


def test_stock_history_links_to_invoices(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, quantity=5)
    invoice = create_invoice(db, staff, [(product, 2)])
    sales = client.get("/api/v1/stock-movements", params={"type": "SALE"}, headers=staff_headers).json()
    assert [(m["invoice_id"], m["invoice_number"]) for m in sales["items"]] == [
        (invoice.id, invoice.invoice_number)
    ]
