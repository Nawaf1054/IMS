"""Display strings for the assistant's rows, chips and figures. They mirror the frontend's
`lib/format.ts` ("SAR 1,234.50", "Oct 1 – Oct 23", "+12.3%") so AI answers look like the rest of IMS."""

from datetime import date
from decimal import Decimal

from app.common.money import to_money

MINUS = "−"  # true minus sign, as in the frontend
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def money(amount: Decimal | int, currency: str) -> str:
    """'SAR 1,234.50'."""
    value = to_money(amount)
    sign = f"{MINUS} " if value < 0 else ""
    return f"{sign}{currency} {abs(value):,.2f}"


def number(value: int) -> str:
    """'1,234'."""
    return f"{value:,}"


def short_date(day: date, *, with_year: bool = False) -> str:
    """'Oct 1', or 'Oct 1, 2026'."""
    text = f"{_MONTHS[day.month - 1]} {day.day}"
    return f"{text}, {day.year}" if with_year else text


def date_range(start: date, end: date) -> str:
    """'Oct 1' for one day, 'Oct 1 – Oct 23' for a range; years are shown when they differ."""
    if start == end:
        return short_date(start)
    with_year = start.year != end.year
    return f"{short_date(start, with_year=with_year)} – {short_date(end, with_year=with_year)}"


def percent_change(current: Decimal, previous: Decimal) -> Decimal | None:
    """Change from `previous` to `current` in percent, to one decimal; None when previous is 0."""
    if not previous:
        return None
    return ((current - previous) / previous * 100).quantize(Decimal("0.1"))


def signed_percent(change: Decimal) -> str:
    """'+12.3%' / '−4.0%'."""
    return f"{'+' if change >= 0 else MINUS}{abs(change):.1f}%"


def share_percent(share: float) -> str:
    """0.311 → '31%'."""
    return f"{round(share * 100)}%"


def plural(count: int, word: str) -> str:
    """'1 product', '3 products'."""
    return f"{number(count)} {word}{'' if count == 1 else 's'}"
