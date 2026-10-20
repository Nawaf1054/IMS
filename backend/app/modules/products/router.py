"""Products: read for everyone, write for admins (staff can't change prices)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.common.pagination import Page, PageParams, page_params
from app.modules.products import service
from app.modules.products.schemas import (
    DeleteResult,
    ProductCreate,
    ProductDetailOut,
    ProductFilters,
    ProductOut,
    ProductUpdate,
)

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=Page[ProductOut])
def list_products(
    db: DbSession,
    _: CurrentUser,
    filters: Annotated[ProductFilters, Query()],
    params: PageParams = Depends(page_params),
) -> Page[ProductOut]:
    """Products matching the search, category, low-stock and sort filters (PRD-3)."""
    return service.list_products(db, filters, params)


@router.post("", response_model=ProductOut)
def create_product(data: ProductCreate, db: DbSession, _: AdminUser) -> ProductOut:
    """Admin: adds a product. It starts with zero stock."""
    return service.create_product(db, data)


@router.get("/{product_id}", response_model=ProductDetailOut)
def get_product(product_id: int, db: DbSession, _: CurrentUser) -> ProductDetailOut:
    """One product with its last-30-days sales and last receipt date."""
    return service.get_detail(db, product_id)


@router.patch("/{product_id}", response_model=ProductDetailOut)
def update_product(product_id: int, data: ProductUpdate, db: DbSession, _: AdminUser) -> ProductDetailOut:
    """Admin: edits a product's details and prices (not its quantity)."""
    return service.update_product(db, product_id, data)


@router.delete("/{product_id}", response_model=DeleteResult)
def delete_product(product_id: int, db: DbSession, _: AdminUser) -> DeleteResult:
    """Admin: deletes a product, or deactivates it if it was ever invoiced (PRD-2)."""
    return service.delete_product(db, product_id)
