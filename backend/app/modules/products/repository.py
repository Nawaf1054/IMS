"""Database queries for products (SQLAlchemy, no business logic)."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Select, distinct, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.common.search import LIKE_ESCAPE, contains_pattern
from app.modules.categories.models import Category
from app.modules.invoices.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.products.models import Product
from app.modules.products.schemas import ProductFilters
from app.modules.stock.models import MovementType, StockMovement


def list_query(filters: ProductFilters) -> Select[Product]:
    category = aliased(Category)
    parent = aliased(Category)
    stmt = (
        select(Product)
        .join(category, Product.category_id == category.id)
        .outerjoin(parent, category.parent_id == parent.id)
    )

    if filters.search and filters.search.strip():
        pattern = contains_pattern(filters.search.strip())
        stmt = stmt.where(
            or_(
                Product.name.ilike(pattern, escape=LIKE_ESCAPE),
                Product.sku.ilike(pattern, escape=LIKE_ESCAPE),
            )
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


def get_for_update(db: Session, product_id: int) -> Product | None:
    """Loads the product and locks its row until the transaction ends (stock changes, STK-3)."""
    stmt = (
        select(Product)
        .where(Product.id == product_id)
        # OF products: the joined category rows are on the nullable side of an outer join.
        .with_for_update(of=Product)
        # Read the quantity committed by whoever held the lock before us, not a cached copy.
        .execution_options(populate_existing=True)
    )
    return db.scalar(stmt)


def get_many_for_update(db: Session, product_ids: list[int]) -> dict[int, Product]:
    """Loads and locks several products. Rows are locked in id order, so concurrent invoices that
    share products queue up instead of deadlocking."""
    stmt = (
        select(Product)
        .where(Product.id.in_(product_ids))
        .order_by(Product.id)
        .with_for_update(of=Product)
        .execution_options(populate_existing=True)
    )
    return {product.id: product for product in db.scalars(stmt)}


def last_received_at(db: Session, product_id: int) -> datetime | None:
    """When stock was last received with a manual IN movement (not an invoice reversal)."""
    return db.scalar(
        select(func.max(StockMovement.created_at)).where(
            StockMovement.product_id == product_id,
            StockMovement.type == MovementType.IN,
            StockMovement.invoice_id.is_(None),
        )
    )


def invoice_counts(db: Session, product_ids: list[int]) -> dict[int, int]:
    """Invoices (any status) each product appears on."""
    if not product_ids:
        return {}
    rows = db.execute(
        select(InvoiceItem.product_id, func.count(distinct(InvoiceItem.invoice_id)))
        .where(InvoiceItem.product_id.in_(product_ids))
        .group_by(InvoiceItem.product_id)
    )
    return {product_id: count for product_id, count in rows}


@dataclass(frozen=True)
class SalesRow:
    quantity: int
    revenue: Decimal
    invoice_count: int
    cancelled_count: int


def sales_since(db: Session, product_id: int, since: datetime) -> SalesRow:
    """Units and line revenue on completed invoices since `since`, plus completed/cancelled counts."""
    completed = Invoice.status == InvoiceStatus.COMPLETED
    row = db.execute(
        select(
            func.coalesce(func.sum(InvoiceItem.quantity).filter(completed), 0),
            func.coalesce(func.sum(InvoiceItem.line_total).filter(completed), 0),
            func.count(distinct(Invoice.id)).filter(completed),
            func.count(distinct(Invoice.id)).filter(Invoice.status == InvoiceStatus.CANCELLED),
        )
        .select_from(InvoiceItem)
        .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
        .where(InvoiceItem.product_id == product_id, Invoice.created_at >= since)
    ).one()
    return SalesRow(
        quantity=int(row[0]), revenue=Decimal(row[1]), invoice_count=row[2], cancelled_count=row[3]
    )


def get_by_sku(db: Session, sku: str) -> Product | None:
    return db.scalar(select(Product).where(Product.sku == sku.upper()))


def add(db: Session, product: Product) -> Product:
    db.add(product)
    db.flush()
    return product
