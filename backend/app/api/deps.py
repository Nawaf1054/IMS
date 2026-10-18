"""Shared dependencies: DB session, current user, role guards (AUTH-3, AUTH-4)."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import Forbidden
from app.core.security import TokenVerifier, get_token_verifier
from app.db.session import get_db
from app.modules.auth.service import authenticate
from app.modules.users.models import Profile, Role

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
) -> Profile:
    return authenticate(db, verifier, credentials.credentials if credentials else None)


CurrentUser = Annotated[Profile, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> Profile:
    if user.role != Role.ADMIN:
        raise Forbidden()
    return user


AdminUser = Annotated[Profile, Depends(require_admin)]
