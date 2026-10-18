"""INV-2 and business settings: defaults from the environment, admin-only edits."""

import pytest
from fastapi.testclient import TestClient

URL = "/api/v1/settings"


def test_defaults_before_anything_is_saved(client: TestClient, staff_headers: dict[str, str]) -> None:
    response = client.get(URL, headers=staff_headers)
    assert response.status_code == 200
    assert response.json() == {
        "business_name": "My Business",
        "business_address": "",
        "currency": "SAR",
        "tax_rate": "0",
    }


def test_admin_updates_settings(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.patch(
        URL,
        json={
            "business_name": " Al Noor ",
            "business_address": "Riyadh\n",
            "currency": "AED",
            "tax_rate": "0.150",
        },
        headers=admin_headers,
    )
    assert response.status_code == 200, response.json()
    expected = {
        "business_name": "Al Noor",
        "business_address": "Riyadh",
        "currency": "AED",
        "tax_rate": "0.15",
    }
    assert response.json() == expected
    assert client.get(URL, headers=admin_headers).json() == expected

    # Partial update keeps the other values.
    response = client.patch(URL, json={"tax_rate": 0}, headers=admin_headers)
    assert response.json() == expected | {"tax_rate": "0"}


def test_staff_cannot_update_settings(client: TestClient, staff_headers: dict[str, str]) -> None:
    response = client.patch(URL, json={"currency": "USD"}, headers=staff_headers)
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"business_name": "  "}, "Business name is required. It appears on every invoice."),
        ({"currency": "EUR"}, "Unsupported currency."),
        ({"tax_rate": "1.5"}, "Enter a rate between 0 and 100."),
        ({"tax_rate": "-0.1"}, "Enter a rate between 0 and 100."),
        ({"tax_rate": "abc"}, "Enter a rate between 0 and 100."),
    ],
)
def test_settings_validation(
    client: TestClient, admin_headers: dict[str, str], payload: dict[str, str], message: str
) -> None:
    response = client.patch(URL, json=payload, headers=admin_headers)
    assert response.status_code == 422
    assert response.json() == {"detail": message, "code": "VALIDATION_ERROR"}
