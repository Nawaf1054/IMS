"""Supabase admin client: request shapes, key headers and error parsing (HTTP is mocked)."""

import json
import uuid
from collections.abc import Callable

import httpx
import pytest

from app.modules.auth.supabase_admin import BAN_FOREVER, UNBAN, AuthAdminError, SupabaseAuthAdmin

AUTH_URL = "http://supabase.test/auth/v1"


def make_admin(
    handler: Callable[[httpx.Request], httpx.Response], key: str = "sb_secret_abc"
) -> SupabaseAuthAdmin:
    """A real SupabaseAuthAdmin whose HTTP calls go to `handler` instead of the network."""
    admin = SupabaseAuthAdmin(AUTH_URL, key)
    admin._client = httpx.Client(
        base_url=f"{AUTH_URL}/admin", headers=admin._client.headers, transport=httpx.MockTransport(handler)
    )
    return admin


def test_requires_secret_key() -> None:
    with pytest.raises(AuthAdminError):
        SupabaseAuthAdmin(AUTH_URL, "")


def test_header_style_depends_on_key_type() -> None:
    assert "authorization" not in SupabaseAuthAdmin(AUTH_URL, "sb_secret_abc")._client.headers
    legacy = SupabaseAuthAdmin(AUTH_URL, "eyJhbGciOi.legacy.jwt")._client.headers
    assert legacy["authorization"] == "Bearer eyJhbGciOi.legacy.jwt"
    assert legacy["apikey"] == "eyJhbGciOi.legacy.jwt"


def test_create_user() -> None:
    new_id = uuid.uuid4()
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": str(new_id)})

    assert make_admin(handler).create_user("a@example.com", "pw") == new_id
    assert seen[0].method == "POST"
    assert seen[0].url.path == "/auth/v1/admin/users"
    assert json.loads(seen[0].content) == {"email": "a@example.com", "password": "pw", "email_confirm": True}
    assert seen[0].headers["apikey"] == "sb_secret_abc"


def test_update_user_ban_and_email() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={})

    admin = make_admin(handler)
    user_id = uuid.uuid4()
    admin.update_user(user_id, banned=True)
    admin.update_user(user_id, email="b@example.com", banned=False)
    admin.update_user(user_id)  # nothing to change: no request
    assert bodies == [
        {"ban_duration": BAN_FOREVER},
        {"email": "b@example.com", "email_confirm": True, "ban_duration": UNBAN},
    ]


def test_error_codes_are_parsed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            422, json={"code": 422, "error_code": "email_exists", "msg": "already registered"}
        )

    with pytest.raises(AuthAdminError) as caught:
        make_admin(handler).create_user("a@example.com", "pw")
    assert (caught.value.code, caught.value.message, caught.value.status) == (
        "email_exists",
        "already registered",
        422,
    )


def test_network_failure_is_an_auth_admin_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with pytest.raises(AuthAdminError) as caught:
        make_admin(handler).delete_user(uuid.uuid4())
    assert caught.value.code == "unreachable"


def test_find_user_id_by_email() -> None:
    target = uuid.uuid4()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "users": [
                    {"id": str(uuid.uuid4()), "email": "x@example.com"},
                    {"id": str(target), "email": "Noura@Example.com"},
                ]
            },
        )

    admin = make_admin(handler)
    assert admin.find_user_id_by_email("noura@example.com") == target
    assert admin.find_user_id_by_email("missing@example.com") is None
