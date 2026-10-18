"""HTTP endpoints for users (admin only). Thin: parse input, check role, call the service."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import AdminUser, DbSession
from app.common.pagination import Page, PageParams, page_params
from app.modules.auth.supabase_admin import AuthAdmin, get_auth_admin
from app.modules.users import service
from app.modules.users.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

AuthAdminDep = Annotated[AuthAdmin, Depends(get_auth_admin)]


@router.get("", response_model=Page[UserOut])
def list_users(db: DbSession, _: AdminUser, params: PageParams = Depends(page_params)) -> Page[UserOut]:
    return service.list_users(db, params)


@router.post("", response_model=UserOut)
def create_user(data: UserCreate, db: DbSession, _: AdminUser, auth_admin: AuthAdminDep) -> UserOut:
    return UserOut.model_validate(service.create_user(db, auth_admin, data))


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, data: UserUpdate, db: DbSession, admin: AdminUser, auth_admin: AuthAdminDep
) -> UserOut:
    return UserOut.model_validate(service.update_user(db, auth_admin, admin, user_id, data))
