"""Thin client for the Supabase Auth admin API (server-side only, uses the secret key).

Only the users service and the seed script call this. Tests swap it for an in-memory fake.
"""

import uuid
from functools import lru_cache
from typing import Any, Protocol

import httpx

from app.core.config import get_settings

# Supabase has no "deactivate"; a ban long enough to outlive the app does the same job.
BAN_FOREVER = "876000h"
UNBAN = "none"


class AuthAdminError(Exception):
    """A failed admin call. `code` is Supabase's error code, e.g. `email_exists`, `weak_password`."""

    def __init__(self, code: str, message: str, status: int = 0):
        """Keeps Supabase's error code, message and HTTP status for the caller."""
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class AuthAdmin(Protocol):
    """What the app needs from the Supabase Auth admin API. Tests provide a fake."""

    def create_user(self, email: str, password: str) -> uuid.UUID:
        """Creates a confirmed user and returns its Supabase id."""
        ...

    def update_user(
        self, auth_user_id: uuid.UUID, *, email: str | None = None, banned: bool | None = None
    ) -> None:
        """Changes the email and/or the ban (deactivation) state. None leaves a field unchanged."""
        ...

    def delete_user(self, auth_user_id: uuid.UUID) -> None:
        """Deletes the user."""
        ...

    def find_user_id_by_email(self, email: str) -> uuid.UUID | None:
        """The id of the user with this email, or None."""
        ...


class SupabaseAuthAdmin:
    """AuthAdmin over HTTP, authenticated with the server-only secret key."""

    def __init__(self, auth_url: str, secret_key: str, timeout: float = 10.0):
        """Sets up an HTTP client for `<auth_url>/admin` with the right key headers."""
        if not secret_key:
            raise AuthAdminError("not_configured", "SUPABASE_SECRET_KEY is not set.")
        headers = {"apikey": secret_key}
        # New secret keys (sb_secret_…) go in `apikey` only; legacy service_role JWTs also as Bearer.
        if not secret_key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {secret_key}"
        self._client = httpx.Client(base_url=f"{auth_url}/admin", headers=headers, timeout=timeout)

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        """Sends one admin request; raises AuthAdminError on network or HTTP errors."""
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise AuthAdminError("unreachable", f"Supabase Auth is unreachable: {exc}") from exc
        body: dict[str, Any] = response.json() if response.content else {}
        if response.is_error:
            code = body.get("error_code") or body.get("code") or body.get("error") or "unknown"
            message = body.get("msg") or body.get("message") or body.get("error_description") or response.text
            raise AuthAdminError(str(code), str(message), response.status_code)
        return body

    def create_user(self, email: str, password: str) -> uuid.UUID:
        """Creates a confirmed email/password user and returns its id."""
        body = self._request(
            "POST", "/users", json={"email": email, "password": password, "email_confirm": True}
        )
        return uuid.UUID(body["id"])

    def update_user(
        self, auth_user_id: uuid.UUID, *, email: str | None = None, banned: bool | None = None
    ) -> None:
        """Changes the user's email and/or bans them (deactivated) or lifts the ban."""
        payload: dict[str, Any] = {}
        if email is not None:
            payload.update(email=email, email_confirm=True)
        if banned is not None:
            payload["ban_duration"] = BAN_FOREVER if banned else UNBAN
        if payload:
            self._request("PUT", f"/users/{auth_user_id}", json=payload)

    def delete_user(self, auth_user_id: uuid.UUID) -> None:
        """Deletes the Supabase user (used to undo a half-finished create)."""
        self._request("DELETE", f"/users/{auth_user_id}")

    def find_user_id_by_email(self, email: str) -> uuid.UUID | None:
        """Scans the user list (only used by the seed script; fine for small user counts)."""
        page = 1
        while True:
            users = self._request("GET", "/users", params={"page": page, "per_page": 200}).get("users", [])
            for user in users:
                if str(user.get("email", "")).lower() == email.lower():
                    return uuid.UUID(user["id"])
            if len(users) < 200:
                return None
            page += 1


@lru_cache
def get_auth_admin() -> AuthAdmin:
    """The shared admin client, built from the settings on first use."""
    settings = get_settings()
    return SupabaseAuthAdmin(settings.supabase_auth_url, settings.supabase_secret_key)
