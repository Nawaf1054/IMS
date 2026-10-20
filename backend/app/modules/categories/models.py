"""Category: optional parent, one level of subcategories (CAT-2)."""

from typing import Optional

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import CreatedAtMixin, IdMixin


class Category(IdMixin, CreatedAtMixin, Base):
    """A product category. Names are unique (ignoring case); `parent_id` makes it a subcategory."""

    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # Deleting a parent removes its (empty) subcategories too; products block the delete (CAT-3).
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    parent: Mapped[Optional["Category"]] = relationship(remote_side="Category.id", lazy="joined")

    @property
    def path(self) -> str:
        """Display path including the parent, e.g. "Tools › Power Tools"."""
        return f"{self.parent.name} › {self.name}" if self.parent else self.name


# Names are unique regardless of case ("Paint" and "paint" clash).
Index("uq_categories_name_lower", func.lower(Category.name), unique=True)
