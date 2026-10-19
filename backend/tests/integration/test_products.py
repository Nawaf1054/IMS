"""PRD-1 … PRD-5: product CRUD, search/filter/sort/pagination, read-only quantity, low stock."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.products import repository
from tests.factories import create_category, create_product

URL = "/api/v1/products"


def names(response: Any) -> list[str]:
    return [p["name"] for p in response.json()["items"]]


# ── Read ────────────────────────────────────────────────────────────────────


def test_product_shape(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    tools = create_category(db, name="Tools")
    power = create_category(db, name="Power Tools", parent=tools)
    product = create_product(
        db,
        category=power,
        name="Cordless drill",
        sku="tl-1",
        cost_price="310",
        sell_price="449.5",
        quantity=4,
        min_quantity=5,
    )
    response = client.get(f"{URL}/{product.id}", headers=staff_headers)
    assert response.status_code == 200
    body = response.json()
    assert body | {"created_at": None, "updated_at": None} == {
        "id": product.id,
        "name": "Cordless drill",
        "sku": "TL-1",
        "category_id": power.id,
        "category_name": "Power Tools",
        "category_path": "Tools › Power Tools",
        "cost_price": "310.00",
        "sell_price": "449.50",
        "quantity": 4,
        "min_quantity": 5,
        "description": "",
        "is_active": True,
        "is_low_stock": True,
        "invoice_count": 0,
        "created_at": None,
        "updated_at": None,
        "sales_last_30_days": {"quantity": 0, "revenue": "0.00", "invoice_count": 0, "cancelled_count": 0},
        "last_received_at": None,
    }


def test_get_unknown_product(client: TestClient, staff_headers: dict[str, str]) -> None:
    response = client.get(f"{URL}/999999", headers=staff_headers)
    assert response.status_code == 404
    assert response.json() == {"detail": "Product not found.", "code": "PRODUCT_NOT_FOUND"}


def test_list_requires_auth(client: TestClient) -> None:
    assert client.get(URL).status_code == 401


def test_list_hides_inactive_unless_asked(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    create_product(db, name="Active")
    create_product(db, name="Retired", is_active=False)
    assert names(client.get(URL, headers=staff_headers)) == ["Active"]
    response = client.get(URL, params={"include_inactive": "true"}, headers=staff_headers)
    assert names(response) == ["Active", "Retired"]


def test_search_by_name_or_sku(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    create_product(db, name="Portland cement", sku="BM-CEM-050")
    create_product(db, name="Steel rebar", sku="BM-RBR-012")
    create_product(db, name="100% cotton gloves", sku="SF-GLV")
    assert names(client.get(URL, params={"search": "CEMENT"}, headers=staff_headers)) == ["Portland cement"]
    assert names(client.get(URL, params={"search": "rbr"}, headers=staff_headers)) == ["Steel rebar"]
    # LIKE wildcards are matched literally.
    assert names(client.get(URL, params={"search": "100%"}, headers=staff_headers)) == ["100% cotton gloves"]
    assert names(client.get(URL, params={"search": "%"}, headers=staff_headers)) == ["100% cotton gloves"]


def test_category_filter_includes_subcategories(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    tools = create_category(db, name="Tools")
    power = create_category(db, name="Power Tools", parent=tools)
    paint = create_category(db, name="Paint")
    create_product(db, name="Hammer", category=tools)
    create_product(db, name="Drill", category=power)
    create_product(db, name="Roller", category=paint)
    assert names(client.get(URL, params={"category_id": tools.id}, headers=staff_headers)) == [
        "Drill",
        "Hammer",
    ]
    assert names(client.get(URL, params={"category_id": power.id}, headers=staff_headers)) == ["Drill"]


def test_low_stock_filter(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    create_product(db, name="Plenty", quantity=50, min_quantity=10)
    create_product(db, name="At minimum", quantity=10, min_quantity=10)
    create_product(db, name="Out", quantity=0, min_quantity=5)
    create_product(db, name="Inactive and low", quantity=0, min_quantity=5, is_active=False)
    response = client.get(
        URL, params={"low_stock": "true", "include_inactive": "true"}, headers=staff_headers
    )
    assert names(response) == ["At minimum", "Out"]


@pytest.mark.parametrize(
    ("sort", "order", "expected"),
    [
        ("name", "asc", ["apple", "Banana", "cherry"]),
        ("name", "desc", ["cherry", "Banana", "apple"]),
        ("sku", "asc", ["cherry", "apple", "Banana"]),
        ("sell_price", "desc", ["Banana", "cherry", "apple"]),
        ("cost_price", "asc", ["cherry", "Banana", "apple"]),
        ("quantity", "asc", ["Banana", "apple", "cherry"]),
        ("category", "asc", ["apple", "cherry", "Banana"]),
    ],
)
def test_sorting(
    client: TestClient, db: Session, staff_headers: dict[str, str], sort: str, order: str, expected: list[str]
) -> None:
    tools = create_category(db, name="Tools")
    hand = create_category(db, name="Hand", parent=tools)
    garden = create_category(db, name="Garden")
    create_product(db, name="Banana", sku="C-1", category=hand, cost_price="5", sell_price="30", quantity=1)
    create_product(db, name="apple", sku="B-1", category=garden, cost_price="9", sell_price="10", quantity=2)
    create_product(db, name="cherry", sku="A-1", category=tools, cost_price="1", sell_price="20", quantity=3)
    response = client.get(URL, params={"sort": sort, "order": order}, headers=staff_headers)
    assert names(response) == expected


def test_pagination(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    category = create_category(db)
    for i in range(5):
        create_product(db, name=f"Item {i}", category=category)
    response = client.get(URL, params={"page": 2, "page_size": 2}, headers=staff_headers)
    body = response.json()
    assert (body["total"], body["page"], body["page_size"]) == (5, 2, 2)
    assert names(response) == ["Item 2", "Item 3"]


# ── Create ──────────────────────────────────────────────────────────────────


def new_product(category_id: int, **overrides: Any) -> dict[str, Any]:
    return {
        "name": "Wall paint 18L",
        "sku": " pt-wal-018 ",
        "category_id": category_id,
        "cost_price": "135",
        "sell_price": "189.005",
        "min_quantity": 15,
        "description": "  Matte white. ",
        "is_active": True,
    } | overrides


def test_create_product(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    paint = create_category(db, name="Paint")
    response = client.post(URL, json=new_product(paint.id), headers=admin_headers)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["sku"] == "PT-WAL-018"
    assert body["cost_price"] == "135.00"
    assert body["sell_price"] == "189.01"  # half-up to cents
    assert body["quantity"] == 0  # PRD-4: stock arrives through movements
    assert body["is_low_stock"] is True
    assert body["description"] == "Matte white."
    assert body["category_path"] == "Paint"


def test_create_ignores_quantity(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    category = create_category(db)
    response = client.post(URL, json=new_product(category.id, quantity=500), headers=admin_headers)
    assert response.json()["quantity"] == 0


def test_staff_cannot_write_products(client: TestClient, db: Session, staff_headers: dict[str, str]) -> None:
    product = create_product(db)
    assert client.post(URL, json=new_product(product.category_id), headers=staff_headers).status_code == 403
    response = client.patch(f"{URL}/{product.id}", json={"sell_price": "1"}, headers=staff_headers)
    assert response.status_code == 403
    assert client.delete(f"{URL}/{product.id}", headers=staff_headers).status_code == 403


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"name": "  "}, "Name is required."),
        ({"sku": ""}, "SKU is required."),
        ({"cost_price": "-1"}, "Prices must be zero or more, with up to two decimals."),
        ({"sell_price": "abc"}, "Prices must be zero or more, with up to two decimals."),
        ({"sell_price": "."}, "Prices must be zero or more, with up to two decimals."),
        ({"min_quantity": -1}, "Minimum quantity must be a whole number, zero or more."),
        ({"min_quantity": 2.5}, "Minimum quantity must be a whole number, zero or more."),
        ({"category_id": None}, "Choose a category."),
        ({"category_id": 999999}, "Choose a category."),
    ],
)
def test_create_validation(
    client: TestClient, db: Session, admin_headers: dict[str, str], overrides: dict[str, Any], message: str
) -> None:
    category = create_category(db)
    response = client.post(URL, json=new_product(category.id) | overrides, headers=admin_headers)
    assert response.status_code == 422
    assert response.json() == {"detail": message, "code": "VALIDATION_ERROR"}


def test_sku_must_be_unique(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    existing = create_product(db, name="Wall paint 4L", sku="PT-WAL-018")
    response = client.post(URL, json=new_product(existing.category_id), headers=admin_headers)
    assert response.status_code == 409
    assert response.json() == {
        "detail": "PT-WAL-018 is already used by “Wall paint 4L”.",
        "code": "SKU_TAKEN",
    }


# ── Update ──────────────────────────────────────────────────────────────────


def test_update_product(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    product = create_product(db, name="Old", sku="OLD-1", quantity=7)
    other = create_category(db, name="Garden")
    response = client.patch(
        f"{URL}/{product.id}",
        json={
            "name": "New",
            "sku": "new-1",
            "category_id": other.id,
            "sell_price": "99.9",
            "is_active": False,
        },
        headers=admin_headers,
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    assert (body["name"], body["sku"], body["category_name"], body["sell_price"], body["is_active"]) == (
        "New",
        "NEW-1",
        "Garden",
        "99.90",
        False,
    )
    assert body["quantity"] == 7
    assert "sales_last_30_days" in body  # PATCH returns the detail shape


def test_quantity_is_read_only(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    product = create_product(db, quantity=5)
    response = client.patch(f"{URL}/{product.id}", json={"quantity": 100}, headers=admin_headers)
    assert response.status_code == 422
    assert response.json() == {
        "detail": "Quantity changes only through stock movements and invoices.",
        "code": "QUANTITY_READ_ONLY",
    }
    db.refresh(product)
    assert product.quantity == 5


def test_update_sku_clash(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    create_product(db, name="Taken", sku="TAKEN-1")
    product = create_product(db, sku="MINE-1")
    response = client.patch(f"{URL}/{product.id}", json={"sku": "taken-1"}, headers=admin_headers)
    assert response.status_code == 409
    assert response.json()["code"] == "SKU_TAKEN"


def test_update_keeps_own_sku(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    product = create_product(db, sku="MINE-1")
    response = client.patch(
        f"{URL}/{product.id}", json={"sku": "mine-1", "name": "Same SKU"}, headers=admin_headers
    )
    assert response.status_code == 200


def test_update_rejects_unknown_category(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    product = create_product(db)
    response = client.patch(f"{URL}/{product.id}", json={"category_id": 999999}, headers=admin_headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Choose a category."


def test_update_unknown_product(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.patch(f"{URL}/999999", json={"name": "X"}, headers=admin_headers)
    assert response.status_code == 404
    assert response.json()["code"] == "PRODUCT_NOT_FOUND"


# ── Delete ──────────────────────────────────────────────────────────────────


def test_delete_product_without_invoices(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    product = create_product(db)
    response = client.delete(f"{URL}/{product.id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json() == {"result": "deleted"}
    db.expire_all()
    assert repository.get(db, product.id) is None
