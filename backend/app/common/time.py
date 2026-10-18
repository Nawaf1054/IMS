"""UTC time helpers. Every stored timestamp is UTC (PRD §7)."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)
