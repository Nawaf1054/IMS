"""Sequential invoice numbers per business-local year, e.g. INV-2026-00001 (INV-3)."""

from datetime import datetime, tzinfo

PREFIX = "INV"


def invoice_year(at: datetime, tz: tzinfo) -> int:
    """The business-local year an invoice created at `at` belongs to."""
    return at.astimezone(tz).year


def format_number(year: int, sequence: int) -> str:
    """`INV-2026-00001` for year 2026, sequence 1."""
    return f"{PREFIX}-{year}-{sequence:05d}"
