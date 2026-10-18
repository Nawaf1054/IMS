"""Database queries for products (SQLAlchemy, no business logic)."""

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.modules.categories.models import Category
from app.modules.products.models import Product
from app.modules.products.schemas import ProductFilters


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_query(filters: ProductFilters) -> Select[Product]:
    category = aliased(Category)
    parent = aliased(Category)
    stmt = (
        select(Product)
        .join(category, Product.category_id == category.id)
        .outerjoin(parent, category.parent_id == parent.id)
    )

    if filters.search and filters.search.strip():
        pattern = f"%{_escape_like(filters.search.strip())}%"
        stmt = stmt.where(
            or_(Product.name.ilike(pattern, escape="\\"), Product.sku.ilike(pattern, escape="\\"))
        )
    if filters.category_id is not None:
        # A parent category includes its subcategories.
        stmt = stmt.where(or_(category.id == filters.category_id, category.parent_id == filters.category_id))
    if filters.low_stock:
        stmt = stmt.where(Product.is_active, Product.quantity <= Product.min_quantity)
    if not filters.include_inactive:
        stmt = stmt.where(Product.is_active)

    sort_columns = {
        "name": func.lower(Product.name),
        "sku": Product.sku,
        "category": func.lower(func.concat_ws(" › ", parent.name, category.name)),
        "cost_price": Product.cost_price,
        "sell_price": Product.sell_price,
        "quantity": Product.quantity,
    }
    column = sort_columns[filters.sort]
    return stmt.order_by(column.desc() if filters.order == "desc" else column.asc(), Product.id)


def get(db: Session, product_id: int) -> Product | None:
    return db.get(Product, product_id)


def get_by_sku(db: Session, sku: str) -> Product | None:
    return db.scalar(select(Product).where(Product.sku == sku.upper()))


def add(db: Session, product: Product) -> Product:
    db.add(product)
    db.flush()
    return product
