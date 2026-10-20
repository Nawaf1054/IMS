"""Dashboard use cases (DSH-1 … DSH-6). All figures are computed in SQL from recorded invoices and
products, never by the LLM.

Days are business-local (`BUSINESS_TIMEZONE`): "today", "this month" and the date filter all follow
the shop's calendar, not the server's. Only COMPLETED invoices count as sales.
"""

from collections.abc import Mapping
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.common.time import local_midnight_utc, utcnow
from app.core.config import get_settings
from app.core.exceptions import ValidationFailed
from app.modules.dashboard import repository
from app.modules.dashboard.repository import Sales
from app.modules.dashboard.schemas import (
    CategoryRevenue,
    DashboardKpis,
    DashboardRange,
    Granularity,
    SalesOverTime,
    SalesPoint,
    SalesQuery,
    TopProduct,
    TopProductsQuery,
)

# Longest date range the charts accept (about five years). Keeps one request from asking for
# millions of daily buckets.
MAX_RANGE_DAYS = 5 * 366
MAX_TOP_PRODUCTS = 50
NO_SALES = Sales(revenue=Decimal("0"), count=0)


# ── Dates ───────────────────────────────────────────────────────────────────


def _today() -> date:
    """Today's date in the business's time zone."""
    return utcnow().astimezone(get_settings().business_tz).date()


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """UTC `[since, until)` covering the inclusive local days `start` … `end`."""
    tz = get_settings().business_tz
    return local_midnight_utc(start, tz), local_midnight_utc(end + timedelta(days=1), tz)


def _range(query: DashboardRange) -> tuple[date, date]:
    """The validated date filter (DSH-6): both days given, in order, and not absurdly long."""
    start, end = query.start_date, query.end_date
    if start is None or end is None or start > end:
        raise ValidationFailed("Provide a valid start_date and end_date.")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationFailed("Choose a date range of five years or less.")
    return start, end


def previous_period(start: date, end: date) -> tuple[date, date]:
    """The period of the same length that ends the day before `start`."""
    length = (end - start).days + 1
    return start - timedelta(days=length), start - timedelta(days=1)


def previous_month_to_date(today: date) -> tuple[date, date]:
    """The 1st of last month up to the same day number as today (clamped to that month's length),
    e.g. 20 Oct → 1–20 Sep, 31 Mar → 1–28 Feb."""
    this_month = today.replace(day=1)
    last_day_of_previous = this_month - timedelta(days=1)
    start = last_day_of_previous.replace(day=1)
    return start, start.replace(day=min(today.day, last_day_of_previous.day))


# ── KPIs (DSH-1) ────────────────────────────────────────────────────────────


def kpis(db: Session) -> DashboardKpis:
    """Current catalogue and sales figures. They ignore the dashboard's date filter."""
    today = _today()
    yesterday = today - timedelta(days=1)
    windows = {
        "today": _bounds(today, today),
        "yesterday": _bounds(yesterday, yesterday),
        "month": _bounds(today.replace(day=1), today),
        "previous_month": _bounds(*previous_month_to_date(today)),
    }
    sales = repository.sales_in_windows(db, windows)
    products = repository.product_totals(db)
    return DashboardKpis(
        total_products=products.total,
        active_products=products.active,
        inactive_products=products.total - products.active,
        stock_value=products.stock_value,
        stock_units=products.stock_units,
        today_sales=sales["today"].revenue,
        today_invoices=sales["today"].count,
        yesterday_sales=sales["yesterday"].revenue,
        month_sales=sales["month"].revenue,
        month_invoices=sales["month"].count,
        previous_month_sales=sales["previous_month"].revenue,
        low_stock_count=products.low_stock,
        out_of_stock_count=products.out_of_stock,
    )


# ── Sales over time (DSH-2) ─────────────────────────────────────────────────


def bucket_sales(
    start: date, end: date, granularity: Granularity, daily: Mapping[date, Sales]
) -> list[SalesPoint]:
    """Groups daily sales into chart points: one per day, per 7-day block counted from `start`, or
    per calendar month. Every bucket is present, with zero revenue when nothing sold."""
    points: list[SalesPoint] = []
    current_key: object = None
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        key: object
        if granularity == "daily":
            key = day
        elif granularity == "weekly":
            key = offset // 7
        else:
            key = (day.year, day.month)

        sales = daily.get(day, NO_SALES)
        if key != current_key:
            points.append(SalesPoint(period_start=day, period_end=day, revenue=Decimal("0"), invoice_count=0))
            current_key = key
        point = points[-1]
        point.period_end = day
        point.revenue += sales.revenue
        point.invoice_count += sales.count
    return points


def sales_over_time(db: Session, query: SalesQuery) -> SalesOverTime:
    """Revenue per bucket for the chosen range, plus the same buckets for the preceding period."""
    start, end = _range(query)
    previous_start, previous_end = previous_period(start, end)
    # The two periods are adjacent, so one query covers both.
    daily = repository.daily_sales(db, *_bounds(previous_start, end), get_settings().business_timezone)

    points = bucket_sales(start, end, query.granularity, daily)
    previous_points = bucket_sales(previous_start, previous_end, query.granularity, daily)
    return SalesOverTime(
        granularity=query.granularity,
        points=points,
        # Monthly buckets can differ in number between the two periods; the chart pairs them by index.
        previous_points=previous_points[: len(points)],
        total=sum((p.revenue for p in points), Decimal("0")),
        previous_total=sum((p.revenue for p in previous_points), Decimal("0")),
    )


# ── Products and categories (DSH-3, DSH-4) ──────────────────────────────────


def top_products(db: Session, query: TopProductsQuery) -> list[TopProduct]:
    """Best (or, with order=asc, worst) sellers in the range by units or by revenue."""
    since, until = _bounds(*_range(query))
    rows = repository.top_products(
        db,
        since,
        until,
        order_by=query.order_by,
        descending=query.order == "desc",
        limit=min(MAX_TOP_PRODUCTS, max(1, query.limit)),
    )
    return [
        TopProduct(product_id=r.product_id, name=r.name, sku=r.sku, quantity=r.quantity, revenue=r.revenue)
        for r in rows
    ]


def category_revenue(db: Session, query: DashboardRange) -> list[CategoryRevenue]:
    """Revenue per top-level category in the range, with each one's share of the total."""
    since, until = _bounds(*_range(query))
    rows = repository.category_revenue(db, since, until)
    total = sum((r.revenue for r in rows), Decimal("0"))
    return [
        CategoryRevenue(
            category_id=r.category_id,
            name=r.name,
            revenue=r.revenue,
            share=round(float(r.revenue / total), 4) if total else 0.0,
        )
        for r in rows
    ]
