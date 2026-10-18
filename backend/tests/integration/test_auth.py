"""AUTH-3 / AUTH-4: every endpoint needs a valid token for an active profile; roles are enforced."""

import uuid
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.common.time import utcnow
from app.modules.users.models import Role
from tests.factories import auth_header, create_profile, make_token


def test_health(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_me_requires_token(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json() == {
        "detail": "Your session has ended. Sign in again.",
        "code": "NOT_AUTHENTICATED",
    }


def test_me_rejects_invalid_token(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401
    assert response.json()["code"] == "NOT_AUTHENTICATED"


def test_me_rejects_valid_token_without_profile(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {make_token(uuid.uuid4())}"})
    assert response.status_code == 401


def test_me_rejects_deactivated_user(client: TestClient, db: Session) -> None:
    user = create_profile(db, is_active=False)
    response = client.get("/api/v1/auth/me", headers=auth_header(user))
    assert response.status_code == 401
    assert response.json()["code"] == "NOT_AUTHENTICATED"


def test_me_returns_profile_and_records_activity(client: TestClient, db: Session) -> None:
    user = create_profile(db, role=Role.ADMIN, name="Fahad Al-Harbi", email="Fahad@Example.com")
    response = client.get("/api/v1/auth/me", headers=auth_header(user))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user.id
    assert body["name"] == "Fahad Al-Harbi"
    assert body["email"] == "fahad@example.com"
    assert body["role"] == "admin"
    assert body["is_active"] is True
    assert body["last_active_at"] is not None
    assert set(body) == {"id", "name", "email", "role", "is_active", "created_at", "last_active_at"}


def test_me_does_not_rewrite_recent_activity(client: TestClient, db: Session) -> None:
    recent = utcnow() - timedelta(minutes=1)
    user = create_profile(db)
    user.last_active_at = recent
    db.commit()
    client.get("/api/v1/auth/me", headers=auth_header(user))
    db.refresh(user)
    assert user.last_active_at == recent


def test_staff_cannot_use_admin_endpoints(client: TestClient, db: Session) -> None:
    staff = create_profile(db, role=Role.STAFF)
    headers = auth_header(staff)
    for method, path, body in [
        ("GET", "/api/v1/users", None),
        (
            "POST",
            "/api/v1/users",
            {"name": "X", "email": "x@example.com", "role": "staff", "password": "x" * 12},
        ),
        ("PATCH", f"/api/v1/users/{staff.id}", {"role": "admin"}),
    ]:
        response = client.request(method, path, json=body, headers=headers)
        assert response.status_code == 403, path
        assert response.json() == {"detail": "Only admins can do this.", "code": "FORBIDDEN"}


def test_unknown_route_uses_error_format(client: TestClient) -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
