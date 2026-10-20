"""Resolves a Supabase access token to the signed-in profile (AUTH-3).

Sign-in, refresh and sign-out happen in the browser against Supabase Auth; the backend only
verifies the token and looks up the profile that holds the role.
"""

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotAuthenticated
from app.core.security import TokenVerifier
from app.modules.users import service as users_service
from app.modules.users.models import Profile


def authenticate(db: Session, verifier: TokenVerifier, token: str | None) -> Profile:
    """Verifies the token and returns the active profile it belongs to, or raises 401."""
    if not token:
        raise NotAuthenticated()
    claims = verifier.verify(token)
    try:
        auth_user_id = uuid.UUID(str(claims["sub"]))
    except ValueError as exc:
        raise NotAuthenticated() from exc
    profile = users_service.get_active_by_auth_user_id(db, auth_user_id)
    if profile is None:
        raise NotAuthenticated()
    return profile
