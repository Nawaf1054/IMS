"""Categories: read for everyone, write for admins."""

from fastapi import APIRouter, Response

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.modules.categories import service
from app.modules.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: DbSession, _: CurrentUser) -> list[CategoryOut]:
    return service.list_categories(db)


@router.post("", response_model=CategoryOut)
def create_category(data: CategoryCreate, db: DbSession, _: AdminUser) -> CategoryOut:
    return service.create_category(db, data)


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, db: DbSession, _: AdminUser) -> CategoryOut:
    return service.update_category(db, category_id, data)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: DbSession, _: AdminUser) -> Response:
    service.delete_category(db, category_id)
    return Response(status_code=204)
