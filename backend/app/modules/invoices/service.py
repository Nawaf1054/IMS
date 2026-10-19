"""Invoices (INV-1 … INV-8).

Creating an invoice saves it with its items, records a SALE movement per line and reduces stock in
ONE transaction (INV-4): every check runs before anything is written, and any failure rolls back
the whole thing, invoice number included. Cancelling restores stock with reverse IN movements and
marks the invoice CANCELLED (INV-6). Invoices are never edited otherwise.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.common.money import MAX_MONEY, parse_money_input, to_money
from app.common.pagination import Page, PageParams, paginate
from app.common.time import local_day_bounds, utcnow
from app.core.config import get_settings
from app.core.exceptions import Conflict, Forbidden, NotFound, ValidationFailed
from app.modules.invoices import numbering, pdf, repository
from app.modules.invoices.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.invoices.schemas import (
    WALK_IN_CUSTOMER,
    DateRange,
    InvoiceCreate,
    InvoiceFilters,
    InvoiceItemOut,
    InvoiceOut,
    InvoiceStats,
    InvoiceSummaryOut,
)
from app.modules.products import service as products_service
from app.modules.products.models import Product
from app.modules.settings import service as settings_service
from app.modules.stock import service as stock_service
from app.modules.stock.models import MovementType
from app.modules.users.models import Profile, Role

# Invoices keep the tax rate to 0.01%, the same precision the frontend's draft totals use.
TAX_RATE_STEP = Decimal("0.0001")


# ── Totals (INV-1) ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Totals:
    subtotal: Decimal
    discount: Decimal
    tax_amount: Decimal
    total: Decimal


def compute_totals(line_totals: Iterable[Decimal], discount: Decimal, tax_rate: Decimal) -> Totals:
    """The discount comes off the subtotal before tax; tax is rounded half-up to the cent."""
    subtotal = sum(line_totals, Decimal("0"))
    taxable = subtotal - discount
    tax_amount = to_money(taxable * tax_rate)
    return Totals(subtotal=subtotal, discount=discount, tax_amount=tax_amount, total=taxable + tax_amount)


# ── Views ───────────────────────────────────────────────────────────────────


def _summary_fields(invoice: Invoice) -> dict[str, object]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "customer_name": invoice.customer_name,
        "item_count": len(invoice.items),
        "total": invoice.total,
        "status": invoice.status,
        "user_name": invoice.user.name,
        "created_at": invoice.created_at,
    }


def to_summary(invoice: Invoice) -> InvoiceSummaryOut:
    return InvoiceSummaryOut.model_validate(_summary_fields(invoice))


def to_out(db: Session, invoice: Invoice) -> InvoiceOut:
    return InvoiceOut.model_validate(
        _summary_fields(invoice)
        | {
            "subtotal": invoice.subtotal,
            "discount": invoice.discount,
            "tax_rate": invoice.tax_rate,
            "tax_amount": invoice.tax_amount,
            "items": [
                InvoiceItemOut(
                    id=item.id,
                    product_id=item.product_id,
                    product_name=item.product.name,
                    product_sku=item.product.sku,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
                for item in invoice.items
            ],
            "movements": stock_service.invoice_movements(db, invoice.id),
            "cancelled_at": invoice.cancelled_at,
            "cancelled_by_name": invoice.cancelled_by.name if invoice.cancelled_by else None,
        }
    )


# ── Create (INV-1 … INV-5) ──────────────────────────────────────────────────


@dataclass
class _Line:
    product_id: int
    quantity: int
    # None: sell at the product's price.
    unit_price: Decimal | None


def _parse_lines(data: InvoiceCreate) -> tuple[Decimal, list[_Line]]:
    """Checks the request on its own (no database) and merges repeated products into one line."""
    discount = parse_money_input(data.discount)
    if discount is None:
        raise ValidationFailed("Enter the discount as an amount, e.g. 50.00.", code="INVALID_DISCOUNT")
    if not data.items:
        raise ValidationFailed("Add at least one product.", code="EMPTY_INVOICE")

    lines: dict[int, _Line] = {}
    for item in data.items:
        price = None
        if item.unit_price is not None:
            price = parse_money_input(item.unit_price)
            if price is None:
                raise ValidationFailed("Unit prices must be amounts, e.g. 19.00.", code="INVALID_PRICE")
        if item.quantity <= 0:
            raise ValidationFailed("Each line needs a quantity of at least 1.", code="INVALID_QUANTITY")
        line = lines.get(item.product_id)
        if line is None:
            lines[item.product_id] = _Line(item.product_id, item.quantity, price)
        else:
            line.quantity += item.quantity
            line.unit_price = line.unit_price if line.unit_price is not None else price
    return discount, list(lines.values())


def _price_line(line: _Line, product: Product, user: Profile) -> Decimal:
    """Checks one line against the locked product; returns its unit price."""
    if not product.is_active:
        raise ValidationFailed(f"{product.name} is inactive and can’t be sold.", code="PRODUCT_INACTIVE")
    if line.quantity > product.quantity:
        raise Conflict(
            f"Insufficient stock for {product.name}: only {product.quantity} available.",
            code="INSUFFICIENT_STOCK",
        )
    price = product.sell_price if line.unit_price is None else line.unit_price
    # Staff can't change prices (PRD §4).
    if price != product.sell_price and user.role != Role.ADMIN:
        raise Forbidden("Only admins can change prices.")
    return price


def create_invoice(db: Session, user: Profile, data: InvoiceCreate) -> InvoiceOut:
    discount, lines = _parse_lines(data)
    products = products_service.get_many_for_update(db, [line.product_id for line in lines])
    items = []
    for line in lines:
        product = products[line.product_id]
        price = _price_line(line, product, user)
        items.append(
            InvoiceItem(
                product=product,
                product_id=product.id,
                quantity=line.quantity,
                unit_price=price,
                line_total=line.quantity * price,
            )
        )

    tax_rate = settings_service.tax_rate(db).quantize(TAX_RATE_STEP, rounding=ROUND_HALF_UP)
    totals = compute_totals((item.line_total for item in items), discount, tax_rate)
    if discount > totals.subtotal:
        raise ValidationFailed("Discount can’t exceed the subtotal.", code="INVALID_DISCOUNT")
    if max(totals.subtotal, totals.total) > MAX_MONEY:
        raise ValidationFailed("This invoice’s total is too large to save.", code="AMOUNT_TOO_LARGE")

    created_at = utcnow()
    year = numbering.invoice_year(created_at, get_settings().business_tz)
    invoice = repository.add(
        db,
        Invoice(
            invoice_number=numbering.format_number(year, repository.take_number(db, year)),
            customer_name=data.customer_name,
            subtotal=totals.subtotal,
            discount=totals.discount,
            tax_rate=tax_rate,
            tax_amount=totals.tax_amount,
            total=totals.total,
            status=InvoiceStatus.COMPLETED,
            user_id=user.id,
            user=user,
            created_at=created_at,
            items=items,
        ),
    )
    for item in items:
        stock_service.apply(
            db, item.product, MovementType.SALE, -item.quantity, note="", user=user, invoice=invoice
        )
    db.commit()
    return to_out(db, invoice)


# ── Cancel (INV-6) ──────────────────────────────────────────────────────────


def _not_found() -> NotFound:
    return NotFound("Invoice not found.", code="INVOICE_NOT_FOUND")


def cancel_invoice(db: Session, admin: Profile, invoice_id: int) -> InvoiceOut:
    invoice = repository.get_for_update(db, invoice_id)
    if invoice is None:
        raise _not_found()
    if invoice.status == InvoiceStatus.CANCELLED:
        raise Conflict("This invoice is already cancelled.", code="ALREADY_CANCELLED")

    products = products_service.get_many_for_update(db, [item.product_id for item in invoice.items])
    note = f"Reversal: {invoice.invoice_number} cancelled"
    for item in invoice.items:
        stock_service.apply(
            db,
            products[item.product_id],
            MovementType.IN,
            item.quantity,
            note=note,
            user=admin,
            invoice=invoice,
        )
    invoice.status = InvoiceStatus.CANCELLED
    invoice.cancelled_at = utcnow()
    invoice.cancelled_by_id = admin.id
    invoice.cancelled_by = admin
    db.commit()
    return to_out(db, invoice)


# ── Read (INV-7, INV-8) ─────────────────────────────────────────────────────


def get(db: Session, invoice_id: int) -> Invoice:
    invoice = repository.get(db, invoice_id)
    if invoice is None:
        raise _not_found()
    return invoice


def get_detail(db: Session, invoice_id: int) -> InvoiceOut:
    return to_out(db, get(db, invoice_id))


def _bounds(dates: DateRange) -> tuple[datetime | None, datetime | None]:
    return local_day_bounds(dates.start_date, dates.end_date, get_settings().business_tz)


def list_invoices(db: Session, filters: InvoiceFilters, params: PageParams) -> Page[InvoiceSummaryOut]:
    since, until = _bounds(filters)
    stmt = repository.list_query(
        search=(filters.search or "").strip() or None,
        status=filters.status,
        since=since,
        until=until,
        walk_in_label=WALK_IN_CUSTOMER,
    )
    return paginate(db, stmt, params, to_summary)


def stats(db: Session, dates: DateRange) -> InvoiceStats:
    row = repository.stats(db, *_bounds(dates))
    average = to_money(row.completed_total / row.completed_count) if row.completed_count else Decimal("0")
    return InvoiceStats(
        invoice_count=row.completed_count,
        total_sales=row.completed_total,
        average_invoice=average,
        cancelled_count=row.cancelled_count,
        cancelled_total=row.cancelled_total,
    )


def next_number(db: Session) -> str:
    """The number the next invoice will most likely get (shown on the new-invoice form, not reserved)."""
    year = numbering.invoice_year(utcnow(), get_settings().business_tz)
    return numbering.format_number(year, repository.last_number(db, year) + 1)


def render_pdf(db: Session, invoice_id: int) -> tuple[str, bytes]:
    """INV-8: (filename, PDF bytes)."""
    invoice = get_detail(db, invoice_id)
    html = pdf.render_html(
        invoice, settings_service.read(db), printed_at=utcnow(), tz=get_settings().business_tz
    )
    return f"{invoice.invoice_number}.pdf", pdf.html_to_pdf(html)
