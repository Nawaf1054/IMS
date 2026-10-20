"""DSH-1 … DSH-6: dashboard figures are summed in SQL from completed invoices and current stock.

The business time zone in tests is Asia/Riyadh (UTC+3), and "now" is pinned to
2026-10-20 09:00 UTC (12:00 local) so "today" and "this month" are predictable.
"""

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.dashboard import service as dashboard_service
from app.modules.invoices import service as invoices_service
from app.modules.users.models import Profile
from tests.factories import create_category, create_invoice, create_product

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)
URL = "/api/v1/dashboard"


@pytest.fixture(autouse=True)
def pinned_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pins the dashboard's idea of "now"."""
    monkeypatch.setattr(dashboard_service, "utcnow", lambda: NOW)


def at(day: int, hour: int = 9, month: int = 10) -> datetime:
    """A UTC timestamp in 2026."""
    return datetime(2026, month, day, hour, 0, tzinfo=UTC)


def get(client: TestClient, headers: dict[str, str], path: str, **params: Any) -> Any:
    """Calls a dashboard endpoint and returns its JSON, failing on any error status."""
    response = client.get(f"{URL}/{path}", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# ── KPIs (DSH-1) ────────────────────────────────────────────────────────────


def test_kpis(
    client: TestClient, db: Session, admin: Profile, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, cost_price="10", sell_price="100", quantity=100, min_quantity=5)
    create_product(db, cost_price="2.50", quantity=2, min_quantity=5)  # low stock
    create_product(db, quantity=0, min_quantity=0)  # out of stock (and low)
    create_product(db, cost_price="1", quantity=4, min_quantity=10, is_active=False)  # not an alert

    create_invoice(db, staff, [(product, 1)], created_at=at(20, 6))  # today, 09:00 local
    create_invoice(db, staff, [(product, 2)], created_at=at(19, 22))  # 01:00 local on the 20th
    create_invoice(db, staff, [(product, 4)], created_at=at(19, 9))  # yesterday
    create_invoice(db, staff, [(product, 8)], created_at=at(2, 9))  # earlier this month
    create_invoice(db, staff, [(product, 16)], created_at=at(15, 9, month=9))  # previous month, day ≤ 20
    create_invoice(db, staff, [(product, 32)], created_at=at(25, 9, month=9))  # previous month, day > 20
    cancelled = create_invoice(db, staff, [(product, 30)], created_at=at(20, 7))
    invoices_service.cancel_invoice(db, admin, cancelled.id)

    kpis = get(client, staff_headers, "kpis")

    assert kpis == {
        "total_products": 4,
        "active_products": 3,
        "inactive_products": 1,
        # Product 1: 100 bought, 63 sold (cancelled stock came back) → 37 × 10; 2 × 2.50; 4 × 1.
        "stock_value": "379.00",
        "stock_units": 43,
        "today_sales": "300.00",
        "today_invoices": 2,
        "yesterday_sales": "400.00",
        "month_sales": "1500.00",
        "month_invoices": 4,
        "previous_month_sales": "1600.00",
        "low_stock_count": 2,
        "out_of_stock_count": 1,
    }


def test_kpis_on_an_empty_shop(client: TestClient, admin_headers: dict[str, str]) -> None:
    kpis = get(client, admin_headers, "kpis")
    assert kpis["total_products"] == 0
    assert kpis["stock_value"] == "0.00"
    assert kpis["month_sales"] == "0.00"


# ── Sales over time (DSH-2) ─────────────────────────────────────────────────


def test_sales_over_time_daily(
    client: TestClient, db: Session, admin: Profile, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, sell_price="10", quantity=500)
    create_invoice(db, staff, [(product, 1)], created_at=at(18))
    create_invoice(db, staff, [(product, 2)], created_at=at(18, 12))
    # 21:30 UTC on the 19th is 00:30 on the 20th in Riyadh.
    create_invoice(db, staff, [(product, 4)], created_at=datetime(2026, 10, 19, 21, 30, tzinfo=UTC))
    create_invoice(db, staff, [(product, 8)], created_at=at(15))  # previous period
    cancelled = create_invoice(db, staff, [(product, 50)], created_at=at(19))
    invoices_service.cancel_invoice(db, admin, cancelled.id)

    body = get(client, staff_headers, "sales-over-time", start_date="2026-10-18", end_date="2026-10-20")

    assert body["granularity"] == "daily"
    assert body["points"] == [
        {"period_start": "2026-10-18", "period_end": "2026-10-18", "revenue": "30.00", "invoice_count": 2},
        {"period_start": "2026-10-19", "period_end": "2026-10-19", "revenue": "0.00", "invoice_count": 0},
        {"period_start": "2026-10-20", "period_end": "2026-10-20", "revenue": "40.00", "invoice_count": 1},
    ]
    assert [p["period_start"] for p in body["previous_points"]] == ["2026-10-15", "2026-10-16", "2026-10-17"]
    assert body["previous_points"][0]["revenue"] == "80.00"
    assert body["total"] == "70.00"
    assert body["previous_total"] == "80.00"


def test_sales_over_time_weekly_and_monthly(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    product = create_product(db, sell_price="1", quantity=500)
    create_invoice(db, staff, [(product, 5)], created_at=at(30, month=9))
    create_invoice(db, staff, [(product, 7)], created_at=at(8))
    create_invoice(db, staff, [(product, 9)], created_at=at(20))

    weekly = get(
        client,
        staff_headers,
        "sales-over-time",
        start_date="2026-09-28",
        end_date="2026-10-20",
        granularity="weekly",
    )
    assert [(p["period_start"], p["period_end"], p["revenue"]) for p in weekly["points"]] == [
        ("2026-09-28", "2026-10-04", "5.00"),
        ("2026-10-05", "2026-10-11", "7.00"),
        ("2026-10-12", "2026-10-18", "0.00"),
        ("2026-10-19", "2026-10-20", "9.00"),  # a partial last week
    ]

    monthly = get(
        client,
        staff_headers,
        "sales-over-time",
        start_date="2026-09-28",
        end_date="2026-10-20",
        granularity="monthly",
    )
    assert [(p["period_start"], p["period_end"], p["revenue"]) for p in monthly["points"]] == [
        ("2026-09-28", "2026-09-30", "5.00"),
        ("2026-10-01", "2026-10-20", "16.00"),
    ]
    assert monthly["total"] == "21.00"


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({}, "Provide a valid start_date and end_date."),
        ({"start_date": "2026-10-01"}, "Provide a valid start_date and end_date."),
        ({"start_date": "2026-10-20", "end_date": "2026-10-01"}, "Provide a valid start_date and end_date."),
        (
            {"start_date": "2000-01-01", "end_date": "2026-10-01"},
            "Choose a date range of five years or less.",
        ),
    ],
)
@pytest.mark.parametrize("path", ["sales-over-time", "top-products", "category-revenue"])
def test_date_range_is_required_and_valid(
    client: TestClient, admin_headers: dict[str, str], path: str, params: dict[str, str], message: str
) -> None:
    response = client.get(f"{URL}/{path}", params=params, headers=admin_headers)
    assert response.status_code == 422
    assert response.json() == {"detail": message, "code": "VALIDATION_ERROR"}


def test_unknown_granularity_is_rejected(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get(
        f"{URL}/sales-over-time",
        params={"start_date": "2026-10-01", "end_date": "2026-10-02", "granularity": "hourly"},
        headers=admin_headers,
    )
    assert response.status_code == 422


@pytest.mark.parametrize("path", ["kpis", "sales-over-time", "top-products", "category-revenue"])
def test_dashboard_needs_a_signed_in_user(client: TestClient, path: str) -> None:
    assert client.get(f"{URL}/{path}").status_code == 401


# ── Top products (DSH-3) ────────────────────────────────────────────────────


def test_top_products(
    client: TestClient, db: Session, admin: Profile, staff: Profile, staff_headers: dict[str, str]
) -> None:
    cheap = create_product(db, name="Screws", sku="SC", sell_price="1", quantity=500)
    pricey = create_product(db, name="Drill", sku="DR", sell_price="500", quantity=50)
    middle = create_product(db, name="Tape", sku="TP", sell_price="5", quantity=50)
    create_product(db, name="Unsold", sku="UN", quantity=50)
    create_invoice(db, staff, [(cheap, 100), (pricey, 1)], created_at=at(10))
    create_invoice(db, staff, [(middle, 10)], created_at=at(11))
    create_invoice(db, staff, [(pricey, 1)], created_at=at(1, month=9))  # outside the range
    cancelled = create_invoice(db, staff, [(middle, 40)], created_at=at(12))
    invoices_service.cancel_invoice(db, admin, cancelled.id)

    october = {"start_date": "2026-10-01", "end_date": "2026-10-31"}
    by_quantity = get(client, staff_headers, "top-products", **october)
    assert by_quantity == [
        {"product_id": cheap.id, "name": "Screws", "sku": "SC", "quantity": 100, "revenue": "100.00"},
        {"product_id": middle.id, "name": "Tape", "sku": "TP", "quantity": 10, "revenue": "50.00"},
        {"product_id": pricey.id, "name": "Drill", "sku": "DR", "quantity": 1, "revenue": "500.00"},
    ]

    by_revenue = get(client, staff_headers, "top-products", **october, order_by="revenue")
    assert [p["name"] for p in by_revenue] == ["Drill", "Screws", "Tape"]

    least = get(client, staff_headers, "top-products", **october, order="asc", limit=1)
    assert [p["name"] for p in least] == ["Drill"]


# ── Category revenue (DSH-4) ────────────────────────────────────────────────


def test_category_revenue_rolls_up_subcategories(
    client: TestClient, db: Session, staff: Profile, staff_headers: dict[str, str]
) -> None:
    tools = create_category(db, name="Tools")
    power = create_category(db, name="Power Tools", parent=tools)
    paint = create_category(db, name="Paint")
    create_category(db, name="Unsold category")
    drill = create_product(db, category=power, sell_price="300", quantity=10)
    hammer = create_product(db, category=tools, sell_price="50", quantity=10)
    brush = create_product(db, category=paint, sell_price="25", quantity=10)
    create_invoice(db, staff, [(drill, 1), (hammer, 2), (brush, 4)], discount="20", created_at=at(5))

    body = get(client, staff_headers, "category-revenue", start_date="2026-10-01", end_date="2026-10-31")

    # Line totals, before the invoice discount and tax.
    assert body == [
        {"category_id": tools.id, "name": "Tools", "revenue": "400.00", "share": 0.8},
        {"category_id": paint.id, "name": "Paint", "revenue": "100.00", "share": 0.2},
    ]


def test_category_revenue_with_no_sales(client: TestClient, admin_headers: dict[str, str]) -> None:
    assert (
        get(client, admin_headers, "category-revenue", start_date="2026-10-01", end_date="2026-10-31") == []
    )
