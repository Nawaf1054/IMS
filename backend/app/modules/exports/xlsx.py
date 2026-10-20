"""Builds formatted Excel workbooks (EXP-4).

Every export is one sheet with a bold, frozen header row and an autofilter. Money cells use a
currency number format, timestamps are shown in business-local time, and each column is sized to
its widest value. The workbook is written in openpyxl's streaming (write-only) mode, so large
exports don't build a full in-memory spreadsheet.
"""

import io
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, tzinfo
from decimal import Decimal
from enum import StrEnum
from typing import Any

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet._write_only import WriteOnlyWorksheet

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# Excel holds 1,048,576 rows per sheet; one is the header.
MAX_DATA_ROWS = 1_048_575

DATETIME_FORMAT = "yyyy-mm-dd hh:mm"
INTEGER_FORMAT = "#,##0"
SIGNED_INTEGER_FORMAT = "+#,##0;-#,##0;0"
# Column widths are in characters; very long notes wrap at this width instead of stretching the sheet.
MIN_WIDTH = 8
MAX_WIDTH = 60

HEADER_FONT = Font(bold=True)
HEADER_FILL = PatternFill("solid", start_color="F1F5F9")
HEADER_ALIGNMENT = Alignment(vertical="center")


class Kind(StrEnum):
    """How a column's values are written and formatted."""

    TEXT = "text"
    INTEGER = "integer"
    # A signed change such as a stock movement: shown as +5 / -3.
    SIGNED = "signed"
    MONEY = "money"
    DATETIME = "datetime"
    # Written as "Yes" / "No".
    FLAG = "flag"


@dataclass(frozen=True)
class Column:
    """One sheet column: its header text and how its values are formatted."""

    header: str
    kind: Kind = Kind.TEXT


# ── Value formatting ────────────────────────────────────────────────────────


def _money_format(currency: str) -> str:
    """Excel number format that shows amounts like `SAR 1,234.50` but keeps them numeric."""
    return f'"{currency}" #,##0.00;"{currency}" -#,##0.00'


def _cell_value(value: Any, kind: Kind, tz: tzinfo) -> Any:
    """Converts a database value into what Excel should store for this column."""
    if value is None:
        return None
    if kind is Kind.DATETIME:
        # Excel has no time zones: store the business-local wall-clock time.
        return value.astimezone(tz).replace(tzinfo=None) if isinstance(value, datetime) else value
    if kind is Kind.FLAG:
        return "Yes" if value else "No"
    if kind is Kind.TEXT:
        # An empty note is an empty cell, not a cell holding "".
        return str(value) or None
    return value


def _display_width(value: Any, kind: Kind, currency: str) -> int:
    """Roughly how many characters a value takes on screen, used to size its column."""
    if value is None:
        return 0
    if kind is Kind.MONEY:
        return len(f"{currency} {Decimal(value):,.2f}")
    if kind is Kind.DATETIME:
        return len("2026-01-01 00:00")
    if kind in (Kind.INTEGER, Kind.SIGNED):
        return len(f"{int(value):+,}")
    # Multi-line text (e.g. a note) is as wide as its longest line.
    return max((len(line) for line in str(value).splitlines()), default=0)


def _column_cell(sheet: WriteOnlyWorksheet, kind: Kind, currency: str) -> Cell:
    """A pre-formatted cell for one column. Write-only sheets serialize a row as soon as it's
    appended, so the same cell can be reused for every row with only its value changed. Styling
    each cell separately is what makes large exports slow."""
    cell = WriteOnlyCell(sheet)
    if kind is Kind.MONEY:
        cell.number_format = _money_format(currency)
    elif kind is Kind.DATETIME:
        cell.number_format = DATETIME_FORMAT
    elif kind is Kind.INTEGER:
        cell.number_format = INTEGER_FORMAT
    elif kind is Kind.SIGNED:
        cell.number_format = SIGNED_INTEGER_FORMAT
    return cell


def _set_value(cell: Cell, value: Any, kind: Kind) -> None:
    """Puts `value` in a reused column cell."""
    cell.value = value
    if kind is Kind.TEXT and isinstance(value, str):
        # openpyxl stores any text that starts with "=" as a formula. Product names and notes are
        # typed by users, so force plain text: a name like "=HYPERLINK(...)" must never run in Excel.
        cell.data_type = "s"


# ── Workbook ────────────────────────────────────────────────────────────────


def build_workbook(
    title: str,
    columns: Sequence[Column],
    rows: Iterable[Sequence[Any]],
    *,
    currency: str,
    tz: tzinfo,
) -> bytes:
    """Returns the bytes of an .xlsx file with one sheet named `title`.

    `rows` holds raw database values in the same order as `columns`. They're converted first so
    every column can be sized to its widest value before streaming starts (write-only sheets need
    column widths set before any row is written).
    """
    values = [
        [_cell_value(value, col.kind, tz) for value, col in zip(row, columns, strict=True)] for row in rows
    ]

    widths = [len(col.header) for col in columns]
    for row in values:
        for index, (value, col) in enumerate(zip(row, columns, strict=True)):
            widths[index] = max(widths[index], _display_width(value, col.kind, currency))

    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet(title)
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = min(MAX_WIDTH, max(MIN_WIDTH, width + 2))
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:{get_column_letter(len(columns))}{len(values) + 1}"

    header = []
    for col in columns:
        cell = WriteOnlyCell(sheet, col.header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGNMENT
        header.append(cell)
    sheet.append(header)

    cells = [_column_cell(sheet, col.kind, currency) for col in columns]
    kinds = [col.kind for col in columns]
    for row in values:
        for cell, value, kind in zip(cells, row, kinds, strict=True):
            _set_value(cell, value, kind)
        sheet.append(cells)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
