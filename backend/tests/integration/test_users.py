"""AUTH-5: admins create, edit and deactivate users; Supabase Auth is kept in step."""

from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.auth.supabase_admin import AuthAdminError
from app.modules.users import repository
from app.modules.users.models import Profile
from tests.factories import FakeAuthAdmin, auth_header, create_profile


def new_user(**overrides: Any) -> dict[str, Any]:
    """A valid create-user body; keyword arguments override fields."""
    return {
        "name": "Noura",
        "email": "noura@example.com",
        "role": "staff",
        "password": "long-enough-pw",
    } | overrides


# ── List ────────────────────────────────────────────────────────────────────


def test_list_users_paginates(client: TestClient, db: Session, admin: Profile) -> None:
    for _ in range(3):
        create_profile(db)
    response = client.get("/api/v1/users", params={"page_size": 2}, headers=auth_header(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert [u["id"] for u in body["items"]] == sorted(u["id"] for u in body["items"])
    assert len(body["items"]) == 2


def test_list_users_clamps_page_size(client: TestClient, admin: Profile) -> None:
    response = client.get("/api/v1/users", params={"page_size": 500}, headers=auth_header(admin))
    assert response.json()["page_size"] == 100


# ── Create ──────────────────────────────────────────────────────────────────


def test_create_user(client: TestClient, db: Session, admin: Profile, auth_admin: FakeAuthAdmin) -> None:
    response = client.post(
        "/api/v1/users", json=new_user(email="  Noura@Example.com "), headers=auth_header(admin)
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["email"] == "noura@example.com"
    assert body["role"] == "staff"
    assert body["is_active"] is True
    assert body["last_active_at"] is None

    profile = repository.get(db, body["id"])
    assert profile is not None
    assert auth_admin.users[profile.auth_user_id]["email"] == "noura@example.com"


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (new_user(name="  "), "Enter the person’s name."),
        (new_user(email="not-an-email"), "Enter a valid email address."),
        (new_user(role="owner"), "Choose a role."),
        ({k: v for k, v in new_user().items() if k != "role"}, "Choose a role."),
    ],
)
def test_create_user_validation(
    client: TestClient, admin: Profile, payload: dict[str, Any], message: str
) -> None:
    response = client.post("/api/v1/users", json=payload, headers=auth_header(admin))
    assert response.status_code == 422
    assert response.json() == {"detail": message, "code": "VALIDATION_ERROR"}


def test_create_user_rejects_short_password(
    client: TestClient, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    response = client.post("/api/v1/users", json=new_user(password="short"), headers=auth_header(admin))
    assert response.status_code == 422
    assert response.json() == {"detail": "Use at least 10 characters.", "code": "WEAK_PASSWORD"}
    assert auth_admin.calls == []


def test_create_user_rejects_taken_email(
    client: TestClient, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    response = client.post(
        "/api/v1/users", json=new_user(email="ADMIN@example.com"), headers=auth_header(admin)
    )
    assert response.status_code == 409
    assert response.json()["code"] == "EMAIL_TAKEN"
    assert auth_admin.calls == []


def test_create_user_maps_supabase_email_exists(
    client: TestClient, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    auth_admin.fail_with = AuthAdminError("email_exists", "already registered", 422)
    response = client.post("/api/v1/users", json=new_user(), headers=auth_header(admin))
    assert response.status_code == 409
    assert response.json()["code"] == "EMAIL_TAKEN"


def test_create_user_reports_supabase_outage(
    client: TestClient, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    auth_admin.fail_with = AuthAdminError("unreachable", "connection refused")
    response = client.post("/api/v1/users", json=new_user(), headers=auth_header(admin))
    assert response.status_code == 502
    assert response.json()["code"] == "AUTH_PROVIDER_ERROR"


def test_create_user_removes_supabase_user_if_profile_insert_fails(
    client: TestClient, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    quiet_client = TestClient(client.app, raise_server_exceptions=False)
    with patch("app.modules.users.service.create_profile", side_effect=RuntimeError("db down")):
        response = quiet_client.post("/api/v1/users", json=new_user(), headers=auth_header(admin))
    assert response.status_code == 500
    assert [name for name, _ in auth_admin.calls] == ["create", "delete"]
    assert auth_admin.users == {}


# ── Update ──────────────────────────────────────────────────────────────────


def test_update_user_fields(
    client: TestClient, db: Session, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    user = create_profile(db, email="old@example.com")
    response = client.patch(
        f"/api/v1/users/{user.id}",
        json={"name": " New Name ", "email": "New@Example.com", "role": "admin"},
        headers=auth_header(admin),
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    assert (body["name"], body["email"], body["role"]) == ("New Name", "new@example.com", "admin")
    assert auth_admin.calls == [
        ("update", {"id": user.auth_user_id, "email": "new@example.com", "banned": None})
    ]


def test_update_without_auth_changes_skips_supabase(
    client: TestClient, db: Session, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    user = create_profile(db)
    response = client.patch(f"/api/v1/users/{user.id}", json={"name": "Renamed"}, headers=auth_header(admin))
    assert response.status_code == 200
    assert auth_admin.calls == []


def test_deactivate_and_reactivate_user(
    client: TestClient, db: Session, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    user = create_profile(db)
    response = client.patch(f"/api/v1/users/{user.id}", json={"is_active": False}, headers=auth_header(admin))
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert auth_admin.users[user.auth_user_id]["banned"] is True

    # The deactivated user is rejected on their very next request.
    assert client.get("/api/v1/auth/me", headers=auth_header(user)).status_code == 401

    client.patch(f"/api/v1/users/{user.id}", json={"is_active": True}, headers=auth_header(admin))
    assert auth_admin.users[user.auth_user_id]["banned"] is False
    assert client.get("/api/v1/auth/me", headers=auth_header(user)).status_code == 200


def test_update_rolls_back_when_supabase_fails(
    client: TestClient, db: Session, admin: Profile, auth_admin: FakeAuthAdmin
) -> None:
    user = create_profile(db)
    auth_admin.fail_with = AuthAdminError("unreachable", "timeout")
    response = client.patch(f"/api/v1/users/{user.id}", json={"is_active": False}, headers=auth_header(admin))
    assert response.status_code == 502
    db.refresh(user)
    assert user.is_active is True


def test_update_rejects_taken_email(client: TestClient, db: Session, admin: Profile) -> None:
    user = create_profile(db)
    response = client.patch(
        f"/api/v1/users/{user.id}", json={"email": "admin@example.com"}, headers=auth_header(admin)
    )
    assert response.status_code == 409
    assert response.json()["code"] == "EMAIL_TAKEN"


def test_admin_cannot_deactivate_self(client: TestClient, admin: Profile) -> None:
    response = client.patch(
        f"/api/v1/users/{admin.id}", json={"is_active": False}, headers=auth_header(admin)
    )
    assert response.status_code == 409
    assert response.json() == {
        "detail": "You can’t deactivate your own account.",
        "code": "CANNOT_DEACTIVATE_SELF",
    }


def test_admin_cannot_change_own_role(client: TestClient, admin: Profile) -> None:
    response = client.patch(f"/api/v1/users/{admin.id}", json={"role": "staff"}, headers=auth_header(admin))
    assert response.status_code == 409
    assert response.json()["code"] == "CANNOT_CHANGE_OWN_ROLE"


def test_update_unknown_user(client: TestClient, admin: Profile) -> None:
    response = client.patch("/api/v1/users/999999", json={"name": "X"}, headers=auth_header(admin))
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_update_rejects_invalid_json(client: TestClient, admin: Profile) -> None:
    response = client.patch(
        f"/api/v1/users/{admin.id}",
        content=b"{not json",
        headers={**auth_header(admin), "Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "Request body must be valid JSON.", "code": "VALIDATION_ERROR"}
