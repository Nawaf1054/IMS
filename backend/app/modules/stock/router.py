"""Stock movements: every signed-in user can view and record them. There's no update or delete (STK-6)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, DbSession
from app.common.pagination import Page, PageParams, page_params
from app.modules.stock import service
from app.modules.stock.schemas import MovementCreate, MovementFilters, MovementOut, ProductMovementFilters

router = APIRouter(tags=["stock"])


@router.get("/stock-movements", response_model=Page[MovementOut])
def list_movements(
    db: DbSession,
    _: CurrentUser,
    filters: Annotated[MovementFilters, Query()],
    params: PageParams = Depends(page_params),
) -> Page[MovementOut]:
    return service.list_movements(db, filters, params)


@router.post("/stock-movements", response_model=MovementOut)
def record_movement(data: MovementCreate, db: DbSession, user: CurrentUser) -> MovementOut:
    return service.record_movement(db, user, data)


@router.get("/products/{product_id}/movements", response_model=Page[MovementOut])
def list_product_movements(
    product_id: int,
    db: DbSession,
    _: CurrentUser,
    filters: Annotated[ProductMovementFilters, Query()],
    params: PageParams = Depends(page_params),
) -> Page[MovementOut]:
    return service.list_product_movements(db, product_id, filters, params)
