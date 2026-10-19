"""UTC time helpers. Every stored timestamp is UTC (PRD §7); date filters use the business's local days."""

from datetime import UTC, date, datetime, time, timedelta, tzinfo


def utcnow() -> datetime:
    return datetime.now(UTC)


def local_day_bounds(
    start: date | None, end: date | None, tz: tzinfo
) -> tuple[datetime | None, datetime | None]:
    """UTC bounds for an inclusive range of local dates, as [since, until).

    `since` is local midnight at the start of `start`; `until` is local midnight after `end`.
    Comparing raw timestamps against these keeps the `created_at` indexes usable.
    """
    since = datetime.combine(start, time(), tz).astimezone(UTC) if start else None
    until = datetime.combine(end + timedelta(days=1), time(), tz).astimezone(UTC) if end else None
    return since, until
