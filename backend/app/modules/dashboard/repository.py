"""Aggregate SQL for the dashboard (DSH-1 … DSH-4). Every figure is summed by PostgreSQL; nothing
here loads individual rows into Python. Only COMPLETED invoices count as sales.

Time windows are passed as UTC bounds `[since, until)`, so the `invoices.created_at` index is used.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session, aliased

from app.modules.categories.models import Category
from app.modules.invoices.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.products.models import Product

_COMPLETED = Invoice.status == InvoiceStatus.COMPLETED


@dataclass(frozen=True)
class ProductTotals:
    """Catalogue-wide figures for the KPI cards."""

    total: int
    active: int
    stock_value: Decimal
    stock_units: int
    low_stock: int
    out_of_stock: int


@dataclass(frozen=True)
class Sales:
    """Revenue (sum of invoice totals) and number of completed invoices in a window."""

    revenue: Decimal
    count: int


@dataclass(frozen=True)
class ProductSales:
    """Units sold and line revenue for one product."""

    product_id: int
    name: str
    sku: str
    quantity: int
    revenue: Decimal


@dataclass(frozen=True)
class CategorySales:
    """Line revenue for one top-level category."""

    category_id: int
    name: str
    revenue: Decimal


def product_totals(db: Session) -> ProductTotals:
    """Product counts, stock value at cost and low/out-of-stock counts, in one query.

    Low and out-of-stock only count active products: an inactive product can't be sold or restocked
    from the dashboard, so it isn't an alert (same rule as the products list's low-stock filter).
    """
    active = Product.is_active
    row = db.execute(
        select(
            func.count(),
            func.count().filter(active),
            func.coalesce(func.sum(Product.quantity * Product.cost_price), 0),
            func.coalesce(func.sum(Product.quantity), 0),
            func.count().filter(active, Product.quantity <= Product.min_quantity),
            func.count().filter(active, Product.quantity == 0),
        ).select_from(Product)
    ).one()
    return ProductTotals(
        total=row[0],
        active=row[1],
        stock_value=Decimal(row[2]),
        stock_units=int(row[3]),
        low_stock=row[4],
        out_of_stock=row[5],
    )


def sales_in_windows(db: Session, windows: Mapping[str, tuple[datetime, datetime]]) -> dict[str, Sales]:
    """Sales for several named `[since, until)` windows in a single pass over the invoices."""
    if not windows:
        return {}
    columns: list[Any] = []
    for since, until in windows.values():
        in_window = (Invoice.created_at >= since, Invoice.created_at < until)
        columns += [
            func.coalesce(func.sum(Invoice.total).filter(*in_window), 0),
            func.count().filter(*in_window),
        ]
    row = db.execute(
        select(*columns)
        .select_from(Invoice)
        .where(
            _COMPLETED,
            Invoice.created_at >= min(since for since, _ in windows.values()),
            Invoice.created_at < max(until for _, until in windows.values()),
        )
    ).one()
    return {
        name: Sales(revenue=Decimal(row[2 * index]), count=row[2 * index + 1])
        for index, name in enumerate(windows)
    }


def daily_sales(db: Session, since: datetime, until: datetime, tz_name: str) -> dict[date, Sales]:
    """Sales per business-local calendar day. Days without sales are left out."""
    local_day = cast(func.timezone(tz_name, Invoice.created_at), Date)
    rows = db.execute(
        select(local_day, func.sum(Invoice.total), func.count())
        .where(_COMPLETED, Invoice.created_at >= since, Invoice.created_at < until)
        .group_by(local_day)
    )
    return {day: Sales(revenue=Decimal(revenue), count=count) for day, revenue, count in rows}


def top_products(
    db: Session,
    since: datetime,
    until: datetime,
    *,
    order_by: Literal["quantity", "revenue"],
    descending: bool,
    limit: int,
) -> list[ProductSales]:
    """Products ranked by units sold or by revenue. Ties fall back to revenue, then product id.

    Only products that sold at least once in the window appear.
    """
    quantity = func.sum(InvoiceItem.quantity)
    revenue = func.sum(InvoiceItem.line_total)
    primary = quantity if order_by == "quantity" else revenue
    direction = (lambda column: column.desc()) if descending else (lambda column: column.asc())
    rows = db.execute(
        select(Product.id, Product.name, Product.sku, quantity, revenue)
        .select_from(InvoiceItem)
        .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
        .join(Product, InvoiceItem.product_id == Product.id)
        .where(_COMPLETED, Invoice.created_at >= since, Invoice.created_at < until)
        # Grouping by the primary key lets PostgreSQL select the product's other columns too.
        .group_by(Product.id)
        .order_by(direction(primary), direction(revenue), Product.id)
        .limit(limit)
    )
    return [
        ProductSales(product_id=pid, name=name, sku=sku, quantity=int(qty), revenue=Decimal(rev))
        for pid, name, sku, qty, rev in rows
    ]


def category_revenue(db: Session, since: datetime, until: datetime) -> list[CategorySales]:
    """Line revenue per top-level category (a subcategory's sales count toward its parent),
    highest first."""
    root = aliased(Category)
    revenue = func.sum(InvoiceItem.line_total)
    rows = db.execute(
        select(root.id, root.name, revenue)
        .select_from(InvoiceItem)
        .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
        .join(Product, InvoiceItem.product_id == Product.id)
        .join(Category, Product.category_id == Category.id)
        .join(root, root.id == func.coalesce(Category.parent_id, Category.id))
        .where(_COMPLETED, Invoice.created_at >= since, Invoice.created_at < until)
        .group_by(root.id)
        .order_by(revenue.desc(), root.id)
    )
    return [CategorySales(category_id=cid, name=name, revenue=Decimal(rev)) for cid, name, rev in rows]
