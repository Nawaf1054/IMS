"""Database queries for stock movements (SQLAlchemy, no business logic)."""

from datetime import datetime

from sqlalchemy import Select, exists, select
from sqlalchemy.orm import Session

from app.modules.stock.models import MovementType, StockMovement


def list_query(
    *,
    product_id: int | None = None,
    type: MovementType | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> Select[StockMovement]:
    """Newest first. `since` is inclusive, `until` exclusive."""
    stmt = select(StockMovement)
    if product_id is not None:
        stmt = stmt.where(StockMovement.product_id == product_id)
    if type is not None:
        stmt = stmt.where(StockMovement.type == type)
    if since is not None:
        stmt = stmt.where(StockMovement.created_at >= since)
    if until is not None:
        stmt = stmt.where(StockMovement.created_at < until)
    return stmt.order_by(StockMovement.created_at.desc(), StockMovement.id.desc())


def add(db: Session, movement: StockMovement) -> StockMovement:
    db.add(movement)
    db.flush()
    return movement


def for_invoice(db: Session, invoice_id: int) -> list[StockMovement]:
    stmt = select(StockMovement).where(StockMovement.invoice_id == invoice_id).order_by(StockMovement.id)
    return list(db.scalars(stmt))


def exists_for_product(db: Session, product_id: int) -> bool:
    return bool(db.scalar(select(exists().where(StockMovement.product_id == product_id))))
