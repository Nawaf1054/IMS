"""Stock rules (STK-1 … STK-6): every quantity change is an immutable movement, written in the same
transaction as the new quantity, and stock never goes below zero.

`apply()` is the only code that changes `Product.quantity`. Invoices call it for SALE movements and
for the IN movements that reverse a cancellation, inside their own transaction.
"""

from sqlalchemy.orm import Session

from app.common.pagination import Page, PageParams, paginate
from app.common.time import local_day_bounds
from app.core.config import get_settings
from app.core.exceptions import Conflict, ValidationFailed
from app.modules.invoices.models import Invoice
from app.modules.products import service as products_service
from app.modules.products.models import Product
from app.modules.stock import repository
from app.modules.stock.models import MovementType, StockMovement
from app.modules.stock.schemas import MovementCreate, MovementFilters, MovementOut, ProductMovementFilters
from app.modules.users.models import Profile

# Largest quantity a PostgreSQL INTEGER column holds.
MAX_QUANTITY = 2_147_483_647


def to_out(movement: StockMovement) -> MovementOut:
    """The API view of a movement."""
    return MovementOut(
        id=movement.id,
        product_id=movement.product_id,
        product_name=movement.product.name,
        product_sku=movement.product.sku,
        type=movement.type,
        quantity=movement.quantity,
        balance_after=movement.balance_after,
        note=movement.note,
        invoice_id=movement.invoice_id,
        invoice_number=movement.invoice.invoice_number if movement.invoice else None,
        user_id=movement.user_id,
        user_name=movement.user.name,
        created_at=movement.created_at,
    )


def apply(
    db: Session,
    product: Product,
    type: MovementType,
    delta: int,
    *,
    note: str,
    user: Profile,
    invoice: Invoice | None = None,
) -> StockMovement:
    """Changes the product's quantity by `delta` and records the movement. Doesn't commit.

    The caller must hold the product's row lock (`products_service.get_for_update`) and commit or
    roll back the whole transaction.
    """
    if delta == 0:
        raise ValueError("A movement must change the quantity.")
    balance = product.quantity + delta
    if balance < 0:
        raise Conflict(
            f"Only {product.quantity} in stock. Quantity can’t go below zero.", code="INSUFFICIENT_STOCK"
        )
    if balance > MAX_QUANTITY:
        raise ValidationFailed("That quantity is too large.", code="INVALID_QUANTITY")

    product.quantity = balance
    return repository.add(
        db,
        StockMovement(
            product_id=product.id,
            type=type,
            quantity=delta,
            balance_after=balance,
            note=note,
            user_id=user.id,
            product=product,
            user=user,
            invoice=invoice,
        ),
    )


def _check(data: MovementCreate) -> int:
    """Validates a manual movement; returns the product id."""
    if data.type == MovementType.SALE:
        raise ValidationFailed(
            "SALE movements are created automatically by invoices.", code="SALE_NOT_ALLOWED"
        )
    if data.product_id is None:
        raise ValidationFailed("Choose a product.")
    if data.quantity < 0 or (data.quantity == 0 and data.type != MovementType.ADJUSTMENT):
        raise ValidationFailed("Enter a quantity greater than zero.", code="INVALID_QUANTITY")
    if data.quantity > MAX_QUANTITY:
        raise ValidationFailed("That quantity is too large.", code="INVALID_QUANTITY")
    if data.type != MovementType.IN and not data.note:
        raise ValidationFailed("Add a note explaining this movement.", code="NOTE_REQUIRED")
    return data.product_id


def record_movement(db: Session, user: Profile, data: MovementCreate) -> MovementOut:
    """IN / OUT / ADJUSTMENT from the stock screen (STK-1 … STK-4)."""
    product_id = _check(data)
    product = products_service.get_for_update(db, product_id)

    if data.type == MovementType.IN:
        delta = data.quantity
    elif data.type == MovementType.OUT:
        delta = -data.quantity
    else:  # ADJUSTMENT: the quantity is what was counted
        delta = data.quantity - product.quantity
        if delta == 0:
            raise ValidationFailed(
                f"The counted quantity matches the system ({product.quantity}).", code="NO_CHANGE"
            )

    movement = apply(db, product, data.type, delta, note=data.note, user=user)
    db.commit()
    db.refresh(movement)  # server-side created_at
    return to_out(movement)


def _page(
    db: Session, filters: ProductMovementFilters, params: PageParams, product_id: int | None
) -> Page[MovementOut]:
    """One page of movements for the filters, optionally for a single product."""
    since, until = local_day_bounds(filters.start_date, filters.end_date, get_settings().business_tz)
    stmt = repository.list_query(product_id=product_id, type=filters.type, since=since, until=until)
    return paginate(db, stmt, params, to_out)


def list_movements(db: Session, filters: MovementFilters, params: PageParams) -> Page[MovementOut]:
    """All movements, newest first (STK-5)."""
    return _page(db, filters, params, filters.product_id)


def list_product_movements(
    db: Session, product_id: int, filters: ProductMovementFilters, params: PageParams
) -> Page[MovementOut]:
    """One product's history, newest first (STK-5)."""
    products_service.get(db, product_id)
    return _page(db, filters, params, product_id)


def export_rows(db: Session, filters: MovementFilters, limit: int) -> list[repository.ExportRow]:
    """Movements for the Excel export (EXP-2, EXP-5): the same filters and order as the list."""
    since, until = local_day_bounds(filters.start_date, filters.end_date, get_settings().business_tz)
    return repository.export_rows(
        db, product_id=filters.product_id, type=filters.type, since=since, until=until, limit=limit
    )


def invoice_movements(db: Session, invoice_id: int) -> list[MovementOut]:
    """An invoice's SALE movements, then its reversals if it was cancelled."""
    return [to_out(m) for m in repository.for_invoice(db, invoice_id)]


def has_movements(db: Session, product_id: int) -> bool:
    """Whether the product has any recorded movement."""
    return repository.exists_for_product(db, product_id)
