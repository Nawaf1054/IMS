"""Invoice, InvoiceItem and the per-year invoice number counter (INV-1 … INV-6).

Invoices are never edited after creation (INV-6): the only change is cancellation, which sets
`status`, `cancelled_at` and `cancelled_by_id`. Totals are stored as computed at sale time.
"""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import CreatedAtMixin, IdMixin
from app.modules.products.models import Product
from app.modules.users.models import Profile


class InvoiceStatus(StrEnum):
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class InvoiceItem(IdMixin, Base):
    __tablename__ = "invoice_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("line_total = quantity * unit_price", name="line_total_matches"),
    )

    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # RESTRICT: a product that was sold can only be deactivated, never deleted (PRD-2).
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    # The price at the time of sale (INV-5).
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    product: Mapped[Product] = relationship(lazy="joined", innerjoin=True)


class Invoice(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("discount >= 0 AND discount <= subtotal", name="discount_within_subtotal"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 1", name="tax_rate_fraction"),
        CheckConstraint("tax_amount >= 0", name="tax_amount_non_negative"),
        CheckConstraint("total = subtotal - discount + tax_amount", name="total_adds_up"),
        CheckConstraint(
            "(status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancelled_by_id IS NOT NULL)",
            name="cancellation_recorded",
        ),
        Index("ix_invoices_created_at", "created_at"),
    )

    # e.g. INV-2026-00001 (INV-3)
    invoice_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    # NULL is a walk-in customer.
    customer_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Fraction, to 0.01% (e.g. 0.1500), copied from the settings when the invoice is created.
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status", values_callable=lambda s: [v.value for v in s]),
        nullable=False,
        default=InvoiceStatus.COMPLETED,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=True
    )

    user: Mapped[Profile] = relationship(foreign_keys=[user_id], lazy="joined", innerjoin=True)
    cancelled_by: Mapped[Profile | None] = relationship(foreign_keys=[cancelled_by_id], lazy="joined")
    items: Mapped[list[InvoiceItem]] = relationship(lazy="selectin", order_by=InvoiceItem.id)


class InvoiceSequence(Base):
    """Last invoice number issued per year. Incremented inside the invoice's own transaction, so
    numbers are unique and gapless: a failed invoice rolls its number back too."""

    __tablename__ = "invoice_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    last_number: Mapped[int] = mapped_column(Integer, nullable=False)
