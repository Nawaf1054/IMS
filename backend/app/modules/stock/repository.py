"""Database queries for stock movements (SQLAlchemy, no business logic)."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, Select, exists, select
from sqlalchemy.orm import Session, joinedload

from app.modules.invoices.models import Invoice
from app.modules.products.models import Product
from app.modules.stock.models import MovementType, StockMovement
from app.modules.users.models import Profile


def _conditions(
    *,
    product_id: int | None,
    type: MovementType | None,
    since: datetime | None,
    until: datetime | None,
) -> list[ColumnElement[bool]]:
    """WHERE clauses for the movement filters (STK-5). `since` is inclusive, `until` exclusive."""
    conditions = []
    if product_id is not None:
        conditions.append(StockMovement.product_id == product_id)
    if type is not None:
        conditions.append(StockMovement.type == type)
    if since is not None:
        conditions.append(StockMovement.created_at >= since)
    if until is not None:
        conditions.append(StockMovement.created_at < until)
    return conditions


# Movement lists show only the product's name and SKU, the user's name and the invoice number.
# Without these options, loading a movement would also load the product's category, the invoice's
# users and every line item on the invoice.
_LIST_LOADING = (
    joinedload(StockMovement.product).lazyload("*"),
    joinedload(StockMovement.invoice).lazyload("*"),
    joinedload(StockMovement.user),
)


def list_query(
    *,
    product_id: int | None = None,
    type: MovementType | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> Select[StockMovement]:
    """Movements matching the filters, newest first."""
    return (
        select(StockMovement)
        .where(*_conditions(product_id=product_id, type=type, since=since, until=until))
        .options(*_LIST_LOADING)
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
    )


@dataclass(frozen=True)
class ExportRow:
    """One movement as a row of the movements export (EXP-2)."""

    created_at: datetime
    product_name: str
    product_sku: str
    type: MovementType
    quantity: int
    balance_after: int
    note: str
    invoice_number: str | None
    user_name: str


def export_rows(
    db: Session,
    *,
    product_id: int | None,
    type: MovementType | None,
    since: datetime | None,
    until: datetime | None,
    limit: int,
) -> list[ExportRow]:
    """Plain column values for the movements export, newest first, at most `limit` rows."""
    stmt = (
        select(
            StockMovement.created_at,
            Product.name.label("product_name"),
            Product.sku.label("product_sku"),
            StockMovement.type,
            StockMovement.quantity,
            StockMovement.balance_after,
            StockMovement.note,
            Invoice.invoice_number,
            Profile.name.label("user_name"),
        )
        .join(Product, StockMovement.product_id == Product.id)
        .join(Profile, StockMovement.user_id == Profile.id)
        .outerjoin(Invoice, StockMovement.invoice_id == Invoice.id)
        .where(*_conditions(product_id=product_id, type=type, since=since, until=until))
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(limit)
    )
    return [ExportRow(**row._asdict()) for row in db.execute(stmt)]


def add(db: Session, movement: StockMovement) -> StockMovement:
    """Stages a new movement and flushes it so it gets an id. Doesn't commit."""
    db.add(movement)
    db.flush()
    return movement


def for_invoice(db: Session, invoice_id: int) -> list[StockMovement]:
    """An invoice's movements (its SALEs, then any reversals), oldest first."""
    stmt = (
        select(StockMovement)
        .where(StockMovement.invoice_id == invoice_id)
        .options(*_LIST_LOADING)
        .order_by(StockMovement.id)
    )
    return list(db.scalars(stmt))


def exists_for_product(db: Session, product_id: int) -> bool:
    """Whether the product has any recorded movement."""
    return bool(db.scalar(select(exists().where(StockMovement.product_id == product_id))))
