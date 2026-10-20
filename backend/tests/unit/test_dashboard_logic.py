"""Pure date and bucketing rules behind the dashboard charts (no database)."""

from datetime import date
from decimal import Decimal

from app.modules.dashboard.repository import Sales
from app.modules.dashboard.service import bucket_sales, previous_month_to_date, previous_period


def test_previous_period_has_the_same_length() -> None:
    assert previous_period(date(2026, 10, 1), date(2026, 10, 31)) == (date(2026, 8, 31), date(2026, 9, 30))
    assert previous_period(date(2026, 10, 20), date(2026, 10, 20)) == (date(2026, 10, 19), date(2026, 10, 19))


def test_previous_month_to_date_clamps_to_the_month_length() -> None:
    assert previous_month_to_date(date(2026, 10, 20)) == (date(2026, 9, 1), date(2026, 9, 20))
    assert previous_month_to_date(date(2026, 3, 31)) == (date(2026, 2, 1), date(2026, 2, 28))
    assert previous_month_to_date(date(2026, 1, 15)) == (date(2025, 12, 1), date(2025, 12, 15))


def test_buckets_cover_every_day_even_without_sales() -> None:
    daily = {date(2026, 10, 2): Sales(revenue=Decimal("12.50"), count=2)}
    points = bucket_sales(date(2026, 10, 1), date(2026, 10, 3), "daily", daily)
    assert [(p.period_start, p.revenue, p.invoice_count) for p in points] == [
        (date(2026, 10, 1), Decimal("0"), 0),
        (date(2026, 10, 2), Decimal("12.50"), 2),
        (date(2026, 10, 3), Decimal("0"), 0),
    ]


def test_weekly_buckets_count_seven_days_from_the_start() -> None:
    daily = {date(2026, 10, d): Sales(revenue=Decimal("1"), count=1) for d in range(1, 16)}
    points = bucket_sales(date(2026, 10, 1), date(2026, 10, 15), "weekly", daily)
    assert [(p.period_start.day, p.period_end.day, p.invoice_count) for p in points] == [
        (1, 7, 7),
        (8, 14, 7),
        (15, 15, 1),
    ]


def test_monthly_buckets_follow_the_calendar() -> None:
    points = bucket_sales(date(2026, 1, 30), date(2026, 3, 2), "monthly", {})
    assert [(p.period_start, p.period_end) for p in points] == [
        (date(2026, 1, 30), date(2026, 1, 31)),
        (date(2026, 2, 1), date(2026, 2, 28)),
        (date(2026, 3, 1), date(2026, 3, 2)),
    ]
