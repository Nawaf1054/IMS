"""UTC time helpers. Every stored timestamp is UTC (PRD §7); date filters use the business's local days."""

from datetime import UTC, date, datetime, time, timedelta, tzinfo


def utcnow() -> datetime:
    """The current time as a timezone-aware UTC datetime."""
    return datetime.now(UTC)


def local_midnight_utc(day: date, tz: tzinfo) -> datetime:
    """The UTC instant at which `day` starts in time zone `tz`."""
    return datetime.combine(day, time(), tz).astimezone(UTC)


def local_day_bounds(
    start: date | None, end: date | None, tz: tzinfo
) -> tuple[datetime | None, datetime | None]:
    """UTC bounds for an inclusive range of local dates, as [since, until).

    `since` is local midnight at the start of `start`; `until` is local midnight after `end`.
    Comparing raw timestamps against these keeps the `created_at` indexes usable.
    """
    since = local_midnight_utc(start, tz) if start else None
    until = local_midnight_utc(end + timedelta(days=1), tz) if end else None
    return since, until
