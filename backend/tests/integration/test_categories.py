"""CAT-1 … CAT-3: category CRUD, one level of nesting, no deleting categories with products."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.categories import repository
from tests.factories import create_category, create_product

URL = "/api/v1/categories"


def test_list_categories_with_product_counts(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    tools = create_category(db, name="Tools")
    power = create_category(db, name="Power Tools", parent=tools)
    create_product(db, category=power)
    create_product(db, category=power, is_active=False)

    response = client.get(URL, headers=staff_headers)
    assert response.status_code == 200
    by_name = {c["name"]: c for c in response.json()}
    assert by_name["Tools"] == {
        "id": tools.id,
        "name": "Tools",
        "parent_id": None,
        "product_count": 0,
        "created_at": by_name["Tools"]["created_at"],
    }
    assert by_name["Power Tools"]["parent_id"] == tools.id
    assert by_name["Power Tools"]["product_count"] == 2


def test_create_category(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    parent = create_category(db, name="Tools")
    response = client.post(URL, json={"name": "  Hand Tools ", "parent_id": parent.id}, headers=admin_headers)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["name"] == "Hand Tools"
    assert body["parent_id"] == parent.id
    assert body["product_count"] == 0


def test_staff_cannot_write_categories(
    client: TestClient, db: Session, staff_headers: dict[str, str]
) -> None:
    category = create_category(db)
    assert client.post(URL, json={"name": "X"}, headers=staff_headers).status_code == 403
    assert client.patch(f"{URL}/{category.id}", json={"name": "Y"}, headers=staff_headers).status_code == 403
    assert client.delete(f"{URL}/{category.id}", headers=staff_headers).status_code == 403


def test_create_requires_name(client: TestClient, admin_headers: dict[str, str]) -> None:
    for payload in ({}, {"name": "   "}):
        response = client.post(URL, json=payload, headers=admin_headers)
        assert response.status_code == 422
        assert response.json() == {"detail": "Enter a name for the category.", "code": "VALIDATION_ERROR"}


def test_names_are_unique_ignoring_case(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    create_category(db, name="Paint")
    response = client.post(URL, json={"name": "paint"}, headers=admin_headers)
    assert response.status_code == 409
    assert response.json() == {
        "detail": "“paint” already exists. Category names must be unique.",
        "code": "CATEGORY_EXISTS",
    }


def test_unknown_parent(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.post(URL, json={"name": "X", "parent_id": 999999}, headers=admin_headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "Parent category not found."


def test_only_one_level_of_subcategories(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    tools = create_category(db, name="Tools")
    power = create_category(db, name="Power Tools", parent=tools)
    response = client.post(URL, json={"name": "Drills", "parent_id": power.id}, headers=admin_headers)
    assert response.status_code == 422
    assert response.json()["code"] == "NESTING_TOO_DEEP"


def test_category_with_children_cannot_become_a_subcategory(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    tools = create_category(db, name="Tools")
    create_category(db, name="Power Tools", parent=tools)
    garden = create_category(db, name="Garden")
    response = client.patch(f"{URL}/{tools.id}", json={"parent_id": garden.id}, headers=admin_headers)
    assert response.status_code == 422
    assert response.json()["code"] == "NESTING_TOO_DEEP"


def test_category_cannot_be_its_own_parent(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    category = create_category(db)
    response = client.patch(f"{URL}/{category.id}", json={"parent_id": category.id}, headers=admin_headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "A category can’t be its own parent."


def test_update_rename_and_move(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    tools = create_category(db, name="Tools")
    category = create_category(db, name="Drils", parent=tools)
    create_product(db, category=category)

    response = client.patch(f"{URL}/{category.id}", json={"name": "Drills"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Drills"
    assert response.json()["parent_id"] == tools.id  # omitted parent_id: unchanged
    assert response.json()["product_count"] == 1

    response = client.patch(f"{URL}/{category.id}", json={"parent_id": None}, headers=admin_headers)
    assert response.json()["parent_id"] is None  # explicit null: top level


def test_rename_to_same_name_different_case(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    category = create_category(db, name="paint")
    response = client.patch(f"{URL}/{category.id}", json={"name": "Paint"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Paint"


def test_update_unknown_category(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.patch(f"{URL}/999999", json={"name": "X"}, headers=admin_headers)
    assert response.status_code == 404
    assert response.json()["code"] == "CATEGORY_NOT_FOUND"


def test_delete_empty_category_and_its_subcategories(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    tools = create_category(db, name="Tools")
    power = create_category(db, name="Power Tools", parent=tools)
    ids = (tools.id, power.id)
    response = client.delete(f"{URL}/{tools.id}", headers=admin_headers)
    assert response.status_code == 204
    db.expire_all()
    assert [repository.get(db, i) for i in ids] == [None, None]


def test_cannot_delete_category_with_products(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    paint = create_category(db, name="Paint")
    create_product(db, category=paint)
    response = client.delete(f"{URL}/{paint.id}", headers=admin_headers)
    assert response.status_code == 409
    assert response.json() == {
        "detail": "1 product is assigned to Paint. Move them to another category or deactivate them, then try again.",
        "code": "CATEGORY_NOT_EMPTY",
    }


def test_cannot_delete_parent_whose_subcategories_have_products(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    tools = create_category(db, name="Tools")
    power = create_category(db, name="Power Tools", parent=tools)
    create_product(db, category=power)
    create_product(db, category=power)
    response = client.delete(f"{URL}/{tools.id}", headers=admin_headers)
    assert response.status_code == 409
    assert response.json()["detail"] == "Its subcategories (Power Tools) hold 2 products. Empty them first."
