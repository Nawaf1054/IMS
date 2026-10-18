"""GET /settings (everyone) and PATCH /settings (admin)."""

from fastapi import APIRouter

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.modules.settings import service
from app.modules.settings.schemas import BusinessSettingsOut, BusinessSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=BusinessSettingsOut)
def read_settings(db: DbSession, _: CurrentUser) -> BusinessSettingsOut:
    return service.read(db)


@router.patch("", response_model=BusinessSettingsOut)
def update_settings(data: BusinessSettingsUpdate, db: DbSession, _: AdminUser) -> BusinessSettingsOut:
    return service.update(db, data)
