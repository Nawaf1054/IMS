"""Dashboard request and response schemas (DSH-1 … DSH-6). They match the frontend's
`features/dashboard/types.ts` field for field."""

from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.common.money import Money

Granularity = Literal["daily", "weekly", "monthly"]


# ── Output ──────────────────────────────────────────────────────────────────


class DashboardKpis(BaseModel):
    """GET /dashboard/kpis: current figures, independent of the date filter (DSH-1)."""

    total_products: int
    active_products: int
    inactive_products: int
    # Quantity on hand × cost price, over every product.
    stock_value: Money
    stock_units: int
    today_sales: Money
    today_invoices: int
    yesterday_sales: Money
    month_sales: Money
    month_invoices: int
    # The same days of the previous month (1st up to today's day number), for comparison.
    previous_month_sales: Money
    low_stock_count: int
    out_of_stock_count: int


class SalesPoint(BaseModel):
    """One bucket of the revenue chart: a day, a 7-day block or a calendar month (inclusive)."""

    period_start: date
    period_end: date
    revenue: Money
    invoice_count: int


class SalesOverTime(BaseModel):
    """GET /dashboard/sales-over-time (DSH-2), with the preceding period of equal length."""

    granularity: Granularity
    points: list[SalesPoint]
    previous_points: list[SalesPoint]
    total: Money
    previous_total: Money


class TopProduct(BaseModel):
    """GET /dashboard/top-products (DSH-3). Revenue is the sum of line totals (before discount and tax)."""

    product_id: int
    name: str
    sku: str
    quantity: int
    revenue: Money


class CategoryRevenue(BaseModel):
    """GET /dashboard/category-revenue (DSH-4). Subcategories roll up into their parent."""

    category_id: int
    name: str
    revenue: Money
    # This category's fraction of the period's revenue (0 … 1).
    share: float


# ── Input ───────────────────────────────────────────────────────────────────


class DashboardRange(BaseModel):
    """The dashboard's date filter (DSH-6): inclusive business-local days. Both are required; the
    service checks them so a missing or reversed range gets one clear message."""

    start_date: date | None = None
    end_date: date | None = None


class SalesQuery(DashboardRange):
    """GET /dashboard/sales-over-time query."""

    granularity: Granularity = "daily"


class TopProductsQuery(DashboardRange):
    """GET /dashboard/top-products query. `order=asc` lists the products that sold least."""

    limit: int = 10
    order_by: Literal["quantity", "revenue"] = "quantity"
    order: Literal["asc", "desc"] = "desc"
