"""StockMovement and MovementType (STK-1, STK-2). Rows are written once and never updated (STK-6)."""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import IdMixin
from app.modules.invoices.models import Invoice
from app.modules.products.models import Product
from app.modules.users.models import Profile


class MovementType(StrEnum):
    IN = "IN"  # received
    OUT = "OUT"  # removed or damaged
    ADJUSTMENT = "ADJUSTMENT"  # correction after a count
    SALE = "SALE"  # created by invoices only


class StockMovement(IdMixin, Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint("quantity <> 0", name="quantity_non_zero"),
        CheckConstraint("balance_after >= 0", name="balance_after_non_negative"),
        Index("ix_stock_movements_product_id_created_at", "product_id", "created_at"),
        Index("ix_stock_movements_created_at", "created_at"),
    )

    # Deleting a product (allowed only if it was never invoiced, PRD-2) removes its history.
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[MovementType] = mapped_column(
        Enum(MovementType, name="movement_type", values_callable=lambda types: [t.value for t in types]),
        nullable=False,
    )
    # Signed change: positive adds stock, negative removes it.
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    # The product's quantity right after this movement.
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    user_id: Mapped[int] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False)
    # Set on SALE movements and on the IN movements that reverse a cancelled invoice.
    invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # clock_timestamp(), not now(): a movement that waited for the product lock is stamped when it's
    # written, so time order matches balance order. now() would be the transaction's start time.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    product: Mapped[Product] = relationship(lazy="joined", innerjoin=True)
    user: Mapped[Profile] = relationship(lazy="joined", innerjoin=True)
    invoice: Mapped[Invoice | None] = relationship(lazy="joined")
