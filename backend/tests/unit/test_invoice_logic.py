"""Pure invoice logic: totals, numbering and the PDF's formatting helpers."""

from datetime import UTC, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.modules.invoices import numbering
from app.modules.invoices.pdf import format_datetime, format_money, format_rate
from app.modules.invoices.service import compute_totals

RIYADH = ZoneInfo("Asia/Riyadh")


def test_totals_apply_discount_before_tax() -> None:
    totals = compute_totals([Decimal("190.00"), Decimal("899.00")], Decimal("50.00"), Decimal("0.15"))
    assert (totals.subtotal, totals.discount, totals.tax_amount, totals.total) == (
        Decimal("1089.00"),
        Decimal("50.00"),
        Decimal("155.85"),
        Decimal("1194.85"),
    )


@pytest.mark.parametrize(
    ("taxable", "rate", "tax"),
    [("0.10", "0.05", "0.01"), ("0.30", "0.05", "0.02"), ("100", "0", "0.00"), ("33.33", "1", "33.33")],
)
def test_tax_rounds_half_up(taxable: str, rate: str, tax: str) -> None:
    assert compute_totals([Decimal(taxable)], Decimal("0"), Decimal(rate)).tax_amount == Decimal(tax)


def test_numbers() -> None:
    assert numbering.format_number(2026, 1) == "INV-2026-00001"
    assert numbering.format_number(2026, 123456) == "INV-2026-123456"


def test_year_follows_the_business_time_zone() -> None:
    new_years_eve = datetime(2026, 12, 31, 21, 30, tzinfo=UTC)  # 00:30 on Jan 1 in Riyadh
    assert numbering.invoice_year(new_years_eve, RIYADH) == 2027
    assert numbering.invoice_year(new_years_eve, UTC) == 2026


def test_formatting() -> None:
    assert format_money(Decimal("1234.5"), "SAR") == "SAR 1,234.50"
    assert format_money(Decimal("0"), "USD") == "USD 0.00"
    assert [format_rate(Decimal(r)) for r in ("0.15", "0.0825", "0", "1")] == ["15%", "8.25%", "0%", "100%"]
    assert format_datetime(datetime(2026, 10, 19, 11, 5, tzinfo=UTC), RIYADH) == "19 October 2026, 14:05"
