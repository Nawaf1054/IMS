"""Database queries for invoices (SQLAlchemy, no business logic)."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, lazyload, selectinload

from app.common.search import LIKE_ESCAPE, contains_pattern
from app.modules.invoices.models import Invoice, InvoiceItem, InvoiceSequence, InvoiceStatus
from app.modules.users.models import Profile


def _created_between(since: datetime | None, until: datetime | None) -> list[ColumnElement[bool]]:
    """`since` is inclusive, `until` exclusive; either may be open."""
    conditions = []
    if since is not None:
        conditions.append(Invoice.created_at >= since)
    if until is not None:
        conditions.append(Invoice.created_at < until)
    return conditions


def _list_conditions(
    *,
    search: str | None,
    status: InvoiceStatus | None,
    since: datetime | None,
    until: datetime | None,
    walk_in_label: str,
) -> list[ColumnElement[bool]]:
    """WHERE clauses for the invoice filters (INV-7)."""
    conditions = _created_between(since, until)
    if search:
        pattern = contains_pattern(search)
        conditions.append(
            or_(
                Invoice.invoice_number.ilike(pattern, escape=LIKE_ESCAPE),
                func.coalesce(Invoice.customer_name, walk_in_label).ilike(pattern, escape=LIKE_ESCAPE),
            )
        )
    if status is not None:
        conditions.append(Invoice.status == status)
    return conditions


def list_query(
    *,
    search: str | None = None,
    status: InvoiceStatus | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    walk_in_label: str,
) -> Select[Invoice]:
    """Invoices matching the filters, newest first.

    The list only needs each invoice's line count, so line items are loaded without their
    products (and the products' categories), and the cancelling user isn't loaded at all.
    """
    conditions = _list_conditions(
        search=search, status=status, since=since, until=until, walk_in_label=walk_in_label
    )
    return (
        select(Invoice)
        .where(*conditions)
        .options(lazyload(Invoice.cancelled_by), selectinload(Invoice.items).lazyload("*"))
        .order_by(Invoice.created_at.desc(), Invoice.id.desc())
    )


@dataclass(frozen=True)
class ExportRow:
    """One invoice as a row of the invoices export (EXP-3)."""

    invoice_number: str
    created_at: datetime
    customer_name: str
    item_count: int
    subtotal: Decimal
    discount: Decimal
    tax_amount: Decimal
    total: Decimal
    status: InvoiceStatus
    user_name: str


def export_rows(
    db: Session,
    *,
    search: str | None,
    status: InvoiceStatus | None,
    since: datetime | None,
    until: datetime | None,
    walk_in_label: str,
    limit: int,
) -> list[ExportRow]:
    """Plain column values for the invoices export, newest first, at most `limit` rows."""
    item_count = (
        select(func.count(InvoiceItem.id)).where(InvoiceItem.invoice_id == Invoice.id).scalar_subquery()
    )
    conditions = _list_conditions(
        search=search, status=status, since=since, until=until, walk_in_label=walk_in_label
    )
    stmt = (
        select(
            Invoice.invoice_number,
            Invoice.created_at,
            func.coalesce(Invoice.customer_name, walk_in_label).label("customer_name"),
            item_count.label("item_count"),
            Invoice.subtotal,
            Invoice.discount,
            Invoice.tax_amount,
            Invoice.total,
            Invoice.status,
            Profile.name.label("user_name"),
        )
        .join(Profile, Invoice.user_id == Profile.id)
        .where(*conditions)
        .order_by(Invoice.created_at.desc(), Invoice.id.desc())
        .limit(limit)
    )
    return [ExportRow(**row._asdict()) for row in db.execute(stmt)]


@dataclass(frozen=True)
class StatsRow:
    """Counts and totals of completed and cancelled invoices in a period."""

    completed_count: int
    completed_total: Decimal
    cancelled_count: int
    cancelled_total: Decimal


def stats(db: Session, since: datetime | None, until: datetime | None) -> StatsRow:
    """Summary figures for the invoices list header, in one query."""
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
    """The invoice with this id (items and users loaded), or None."""
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
    """Stages a new invoice with its items and flushes it so it gets an id. Doesn't commit."""
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
    """The last sequence number issued in `year` (0 if none yet)."""
    return db.scalar(select(InvoiceSequence.last_number).where(InvoiceSequence.year == year)) or 0
