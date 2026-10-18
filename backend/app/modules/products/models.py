"""Product (PRD-1). Quantity changes only through stock movements and invoices (PRD-4)."""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import IdMixin, TimestampMixin
from app.modules.categories.models import Category


class Product(IdMixin, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("cost_price >= 0", name="cost_price_non_negative"),
        CheckConstraint("sell_price >= 0", name="sell_price_non_negative"),
        CheckConstraint("quantity >= 0", name="quantity_non_negative"),
        CheckConstraint("min_quantity >= 0", name="min_quantity_non_negative"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Stored upper-case.
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    sell_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    min_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    category: Mapped[Category] = relationship(lazy="joined")

    @property
    def is_low_stock(self) -> bool:
        """PRD-5."""
        return self.quantity <= self.min_quantity
