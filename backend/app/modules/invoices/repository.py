"""Database queries for invoices (SQLAlchemy, no business logic)."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.common.search import LIKE_ESCAPE, contains_pattern
from app.modules.invoices.models import Invoice, InvoiceSequence, InvoiceStatus


def _created_between(since: datetime | None, until: datetime | None) -> list[ColumnElement[bool]]:
    """`since` is inclusive, `until` exclusive; either may be open."""
    conditions = []
    if since is not None:
        conditions.append(Invoice.created_at >= since)
    if until is not None:
        conditions.append(Invoice.created_at < until)
    return conditions


def list_query(
    *,
    search: str | None = None,
    status: InvoiceStatus | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    walk_in_label: str,
) -> Select[Invoice]:
    """Newest first."""
    stmt = select(Invoice).where(*_created_between(since, until))
    if search:
        pattern = contains_pattern(search)
        stmt = stmt.where(
            or_(
                Invoice.invoice_number.ilike(pattern, escape=LIKE_ESCAPE),
                func.coalesce(Invoice.customer_name, walk_in_label).ilike(pattern, escape=LIKE_ESCAPE),
            )
        )
    if status is not None:
        stmt = stmt.where(Invoice.status == status)
    return stmt.order_by(Invoice.created_at.desc(), Invoice.id.desc())


@dataclass(frozen=True)
class StatsRow:
    completed_count: int
    completed_total: Decimal
    cancelled_count: int
    cancelled_total: Decimal


def stats(db: Session, since: datetime | None, until: datetime | None) -> StatsRow:
    completed = Invoice.status == InvoiceStatus.COMPLETED
    cancelled = Invoice.status == InvoiceStatus.CANCELLED
    stmt = select(
        func.count().filter(completed),
        func.coalesce(func.sum(Invoice.total).filter(completed), 0),
        func.count().filter(cancelled),
        func.coalesce(func.sum(Invoice.total).filter(cancelled), 0),
    ).select_from(Invoice)
    row = db.execute(stmt.where(*_created_between(since, until))).one()
    return StatsRow(row[0], Decimal(row[1]), row[2], Decimal(row[3]))


def get(db: Session, invoice_id: int) -> Invoice | None:
    return db.get(Invoice, invoice_id)


def get_for_update(db: Session, invoice_id: int) -> Invoice | None:
    """Loads the invoice and locks its row, so two cancellations can't both go through."""
    stmt = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        # OF invoices: the joined cancelled_by profile is on the nullable side of an outer join.
        .with_for_update(of=Invoice)
        .execution_options(populate_existing=True)
    )
    return db.scalar(stmt)


def add(db: Session, invoice: Invoice) -> Invoice:
    db.add(invoice)
    db.flush()
    return invoice


def take_number(db: Session, year: int) -> int:
    """Increments the year's counter and returns the new value. The row stays locked until commit,
    so concurrent invoices get consecutive numbers."""
    stmt = (
        insert(InvoiceSequence)
        .values(year=year, last_number=1)
        .on_conflict_do_update(
            index_elements=[InvoiceSequence.year], set_={"last_number": InvoiceSequence.last_number + 1}
        )
        .returning(InvoiceSequence.last_number)
    )
    return db.execute(stmt).scalar_one()


def last_number(db: Session, year: int) -> int:
    return db.scalar(select(InvoiceSequence.last_number).where(InvoiceSequence.year == year)) or 0
