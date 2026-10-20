"""Dashboard endpoints (DSH-1 … DSH-6). Every signed-in user can view the dashboard (PRD §4).

The low-stock table (DSH-5) uses `GET /products?low_stock=true`, so it has no endpoint here.
"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.modules.dashboard import service
from app.modules.dashboard.schemas import (
    CategoryRevenue,
    DashboardKpis,
    DashboardRange,
    SalesOverTime,
    SalesQuery,
    TopProduct,
    TopProductsQuery,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/kpis", response_model=DashboardKpis)
def kpis(db: DbSession, _: CurrentUser) -> DashboardKpis:
    """DSH-1: the KPI cards (current figures; not affected by the date filter)."""
    return service.kpis(db)


@router.get("/sales-over-time", response_model=SalesOverTime)
def sales_over_time(db: DbSession, _: CurrentUser, query: Annotated[SalesQuery, Query()]) -> SalesOverTime:
    """DSH-2: revenue per day, week or month, compared with the previous period."""
    return service.sales_over_time(db, query)


@router.get("/top-products", response_model=list[TopProduct])
def top_products(
    db: DbSession, _: CurrentUser, query: Annotated[TopProductsQuery, Query()]
) -> list[TopProduct]:
    """DSH-3: top sellers by quantity or by revenue."""
    return service.top_products(db, query)


@router.get("/category-revenue", response_model=list[CategoryRevenue])
def category_revenue(
    db: DbSession, _: CurrentUser, query: Annotated[DashboardRange, Query()]
) -> list[CategoryRevenue]:
    """DSH-4: revenue by top-level category."""
    return service.category_revenue(db, query)
