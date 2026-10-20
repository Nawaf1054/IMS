"""Invoice schemas. Shape checks live here; sales rules (with their error codes) in the service.

Amounts arrive as strings the user typed ("50", "19.5") and are parsed in the service, so a bad
discount or price gets its own code (INVALID_DISCOUNT, INVALID_PRICE).
"""

from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.common.money import Money, Rate
from app.modules.invoices.models import InvoiceStatus
from app.modules.stock.schemas import MovementOut

WALK_IN_CUSTOMER = "Walk-in customer"
MAX_CUSTOMER_NAME = 120


# ── Output ──────────────────────────────────────────────────────────────────


class InvoiceSummaryOut(BaseModel):
    """An invoice as shown in the list."""

    id: int
    invoice_number: str
    # null is a walk-in customer.
    customer_name: str | None
    # Number of lines.
    item_count: int
    total: Money
    status: InvoiceStatus
    user_name: str
    created_at: datetime


class InvoiceItemOut(BaseModel):
    """One invoice line as the API returns it."""

    id: int
    product_id: int
    product_name: str
    product_sku: str
    quantity: int
    # Price at the time of sale (INV-5).
    unit_price: Money
    line_total: Money


class InvoiceOut(InvoiceSummaryOut):
    """A full invoice: the summary plus totals, lines and the stock movements it caused."""

    subtotal: Money
    discount: Money
    # Fraction, e.g. "0.15" for 15%.
    tax_rate: Rate
    tax_amount: Money
    items: list[InvoiceItemOut]
    # The SALE movements, plus the reversals if the invoice was cancelled.
    movements: list[MovementOut]
    cancelled_at: datetime | None
    cancelled_by_name: str | None


class InvoiceStats(BaseModel):
    """GET /invoices/summary: header figures for the invoices list."""

    invoice_count: int
    total_sales: Money
    average_invoice: Money
    cancelled_count: int
    cancelled_total: Money


class NextNumberOut(BaseModel):
    """GET /invoices/next-number response."""

    invoice_number: str


# ── Input ───────────────────────────────────────────────────────────────────


class InvoiceLineIn(BaseModel):
    """One requested line: product, quantity and (admins only) a different unit price."""

    product_id: int
    quantity: int
    # Only sent when an admin overrides the product's price.
    unit_price: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def _quantity(cls, value: object) -> object:
        """Accepts only real integers, so "5" or 2.5 get a clear error instead of being coerced."""
        # Strict: "5", 2.5 and true are rejected rather than coerced.
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Each line needs a quantity of at least 1.")
        return value


class InvoiceCreate(BaseModel):
    """POST /invoices body."""

    customer_name: str | None = None
    discount: str = "0"
    items: list[InvoiceLineIn] = []

    @field_validator("customer_name")
    @classmethod
    def _customer_name(cls, value: str | None) -> str | None:
        """Trims the name; blank means a walk-in customer (stored as NULL)."""
        name = (value or "").strip()
        if len(name) > MAX_CUSTOMER_NAME:
            raise ValueError(f"Keep the customer name under {MAX_CUSTOMER_NAME} characters.")
        return name or None


class DateRange(BaseModel):
    """Inclusive business-local days."""

    start_date: date | None = None
    end_date: date | None = None


class InvoiceFilters(DateRange):
    """GET /invoices query (INV-7)."""

    # Matches the invoice number or the customer name ("walk-in" finds walk-in customers).
    search: str | None = None
    status: InvoiceStatus | None = None
