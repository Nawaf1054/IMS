"""Database queries for categories (SQLAlchemy, no business logic)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.categories.models import Category
from app.modules.products.models import Product


def list_all(db: Session) -> list[Category]:
    return list(db.scalars(select(Category).order_by(Category.id)))


def get(db: Session, category_id: int) -> Category | None:
    return db.get(Category, category_id)


def get_by_name(db: Session, name: str) -> Category | None:
    return db.scalar(select(Category).where(func.lower(Category.name) == name.lower()))


def children(db: Session, category_id: int) -> list[Category]:
    return list(db.scalars(select(Category).where(Category.parent_id == category_id).order_by(Category.id)))


def product_counts(db: Session) -> dict[int, int]:
    """Products assigned directly to each category (active and inactive)."""
    rows = db.execute(select(Product.category_id, func.count()).group_by(Product.category_id))
    return {category_id: count for category_id, count in rows}


def count_products_in(db: Session, category_ids: list[int]) -> int:
    if not category_ids:
        return 0
    return db.scalar(select(func.count()).where(Product.category_id.in_(category_ids))) or 0


def add(db: Session, category: Category) -> Category:
    db.add(category)
    db.flush()
    return category
