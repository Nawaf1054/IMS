"""Excel exports (EXP-1 … EXP-5).

Each export takes exactly the filters of its list screen (EXP-5), asks the owning module's service
for the matching rows, and turns them into a formatted workbook (see `xlsx.py`). Exports read data
only; they never change it.
"""

from collections.abc import Sequence
from dataclasses import astuple, dataclass
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.common.time import utcnow
from app.core.config import get_settings
from app.core.exceptions import ValidationFailed
from app.modules.exports.xlsx import MAX_DATA_ROWS, Column, Kind, build_workbook
from app.modules.invoices import service as invoices_service
from app.modules.invoices.schemas import InvoiceFilters
from app.modules.products import service as products_service
from app.modules.products.schemas import ProductFilters
from app.modules.settings import service as settings_service
from app.modules.stock import service as stock_service
from app.modules.stock.schemas import MovementFilters

PRODUCT_COLUMNS = (
    Column("Name"),
    Column("SKU"),
    Column("Category"),
    Column("Cost price", Kind.MONEY),
    Column("Sell price", Kind.MONEY),
    Column("Quantity", Kind.INTEGER),
    Column("Minimum", Kind.INTEGER),
    Column("Stock value (cost)", Kind.MONEY),
    Column("Low stock", Kind.FLAG),
    Column("Active", Kind.FLAG),
)

MOVEMENT_COLUMNS = (
    Column("Date", Kind.DATETIME),
    Column("Product"),
    Column("SKU"),
    Column("Type"),
    Column("Quantity", Kind.SIGNED),
    Column("Balance", Kind.INTEGER),
    Column("Note"),
    Column("Invoice"),
    Column("By"),
)

INVOICE_COLUMNS = (
    Column("Invoice"),
    Column("Date", Kind.DATETIME),
    Column("Customer"),
    Column("Items", Kind.INTEGER),
    Column("Subtotal", Kind.MONEY),
    Column("Discount", Kind.MONEY),
    Column("Tax", Kind.MONEY),
    Column("Total", Kind.MONEY),
    Column("Status"),
    Column("Created by"),
)


@dataclass(frozen=True)
class ExportFile:
    """A finished export: the download's file name and the .xlsx bytes."""

    filename: str
    content: bytes


def _check_size(rows: Sequence[Any]) -> None:
    """Rejects exports that wouldn't fit on one Excel sheet (rows are fetched with one extra to tell)."""
    if len(rows) > MAX_DATA_ROWS:
        raise ValidationFailed(
            "This export has more rows than one Excel sheet can hold. Narrow the filters or the date range.",
            code="EXPORT_TOO_LARGE",
        )


def _today() -> date:
    """Today's date in the business's time zone."""
    return utcnow().astimezone(get_settings().business_tz).date()


def _range_label(start: date | None, end: date | None) -> str:
    """File-name part for a date filter, e.g. `2026-10-01_2026-10-20` or `all_2026-10-20`."""
    return f"{start.isoformat() if start else 'all'}_{(end or _today()).isoformat()}"


def _workbook(db: Session, title: str, columns: Sequence[Column], rows: Sequence[Any]) -> bytes:
    """Checks the size and builds the workbook in the business's currency and time zone."""
    _check_size(rows)
    return build_workbook(
        title,
        columns,
        (astuple(row) for row in rows),
        currency=settings_service.read(db).currency,
        tz=get_settings().business_tz,
    )


def export_products(db: Session, filters: ProductFilters) -> ExportFile:
    """EXP-1: products with category, prices, quantity and the low-stock flag."""
    rows = products_service.export_rows(db, filters, limit=MAX_DATA_ROWS + 1)
    return ExportFile(
        filename=f"products_{_today().isoformat()}.xlsx",
        content=_workbook(db, "Products", PRODUCT_COLUMNS, rows),
    )


def export_movements(db: Session, filters: MovementFilters) -> ExportFile:
    """EXP-2: stock movements for a date range (and type / product, if filtered)."""
    rows = stock_service.export_rows(db, filters, limit=MAX_DATA_ROWS + 1)
    return ExportFile(
        filename=f"movements_{_range_label(filters.start_date, filters.end_date)}.xlsx",
        content=_workbook(db, "Stock movements", MOVEMENT_COLUMNS, rows),
    )


def export_invoices(db: Session, filters: InvoiceFilters) -> ExportFile:
    """EXP-3: invoices (sales) for a date range, with the search and status filters applied."""
    rows = invoices_service.export_rows(db, filters, limit=MAX_DATA_ROWS + 1)
    return ExportFile(
        filename=f"invoices_{_range_label(filters.start_date, filters.end_date)}.xlsx",
        content=_workbook(db, "Invoices", INVOICE_COLUMNS, rows),
    )
