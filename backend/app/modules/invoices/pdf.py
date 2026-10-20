"""Renders the invoice to HTML (Jinja2) and then to PDF with WeasyPrint (INV-8).

The layout matches the frontend's printable invoice. WeasyPrint needs the Pango system library;
it's imported only when a PDF is requested, so the rest of the API works without it (e.g. on a
Windows dev machine) and the PDF endpoint answers PDF_UNAVAILABLE instead.
"""

from datetime import datetime, tzinfo
from decimal import Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.common.money import to_money
from app.core.exceptions import AppError
from app.modules.invoices.schemas import WALK_IN_CUSTOMER, InvoiceOut
from app.modules.settings.schemas import BusinessSettingsOut

TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)
MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)  # fmt: skip


class PdfUnavailable(AppError):
    """503: this server can't render PDFs (WeasyPrint's system libraries are missing)."""

    status_code = 503
    code = "PDF_UNAVAILABLE"
    detail = "PDF download isn’t available on this server. Use Print instead."


def format_money(value: Decimal, currency: str) -> str:
    """Formats like the frontend's formatMoney: "SAR 1,234.50"."""
    return f"{currency} {to_money(value):,.2f}"


def format_rate(rate: Decimal) -> str:
    """Decimal("0.15") -> "15%", Decimal("0.0825") -> "8.25%"."""
    percent = (rate * 100).quantize(Decimal("0.01")).normalize()
    return f"{percent:f}%"


def format_datetime(at: datetime, tz: tzinfo) -> str:
    """Business-local time, e.g. "19 October 2026, 14:05" (English whatever the server's locale)."""
    local = at.astimezone(tz)
    return f"{local.day:02d} {MONTHS[local.month - 1]} {local.year}, {local:%H:%M}"


def render_html(
    invoice: InvoiceOut, business: BusinessSettingsOut, *, printed_at: datetime, tz: tzinfo
) -> str:
    """Fills the printable invoice template with the invoice and the business details."""
    return TEMPLATES.get_template("invoice.html").render(
        invoice=invoice,
        business=business,
        customer=invoice.customer_name or WALK_IN_CUSTOMER,
        money=lambda value: format_money(value, business.currency),
        rate=format_rate(invoice.tax_rate),
        taxable=invoice.subtotal - invoice.discount,
        created=format_datetime(invoice.created_at, tz),
        printed=format_datetime(printed_at, tz),
    )


def html_to_pdf(html: str) -> bytes:
    """Converts the rendered HTML to PDF bytes with WeasyPrint."""
    try:
        # Imported here: it needs system libraries (see the module docstring).
        from weasyprint import HTML
    except OSError as exc:
        raise PdfUnavailable() from exc
    return HTML(string=html).write_pdf()  # type: ignore[no-any-return]
