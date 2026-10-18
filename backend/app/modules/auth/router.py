"""GET /auth/me. Sign-in and token refresh are handled by Supabase Auth, not this API."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.modules.users import service as users_service
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserOut)
def me(db: DbSession, user: CurrentUser) -> UserOut:
    return UserOut.model_validate(users_service.touch_last_active(db, user))
