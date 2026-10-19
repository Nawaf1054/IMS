"""Business rules for products (PRD-1 … PRD-5)."""

from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.pagination import Page, PageParams, paginate
from app.core.exceptions import Conflict, NotFound, ValidationFailed
from app.modules.categories import service as categories_service
from app.modules.products import repository
from app.modules.products.models import Product
from app.modules.products.schemas import (
    DeleteResult,
    ProductCreate,
    ProductDetailOut,
    ProductFilters,
    ProductOut,
    ProductUpdate,
    SalesSummary,
)


def invoice_counts(db: Session, product_ids: list[int]) -> dict[int, int]:
    """Invoices each product appears on. Always empty until the invoices module exists (M5)."""
    return {}


def to_out(product: Product, invoice_count: int = 0) -> ProductOut:
    return ProductOut(
        id=product.id,
        name=product.name,
        sku=product.sku,
        category_id=product.category_id,
        category_name=product.category.name,
        category_path=product.category.path,
        cost_price=product.cost_price,
        sell_price=product.sell_price,
        quantity=product.quantity,
        min_quantity=product.min_quantity,
        description=product.description,
        is_active=product.is_active,
        is_low_stock=product.is_low_stock,
        invoice_count=invoice_count,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


def _detail(db: Session, product: Product) -> ProductDetailOut:
    base = to_out(product, invoice_counts(db, [product.id]).get(product.id, 0))
    # Sales come from invoices (M5).
    return ProductDetailOut(
        **base.model_dump(),
        sales_last_30_days=SalesSummary(quantity=0, revenue=Decimal("0"), invoice_count=0, cancelled_count=0),
        last_received_at=repository.last_received_at(db, product.id),
    )


def _not_found() -> NotFound:
    return NotFound("Product not found.", code="PRODUCT_NOT_FOUND")


def get(db: Session, product_id: int) -> Product:
    product = repository.get(db, product_id)
    if product is None:
        raise _not_found()
    return product


def get_for_update(db: Session, product_id: int) -> Product:
    """The product, with its row locked until commit. Only the stock service changes quantity."""
    product = repository.get_for_update(db, product_id)
    if product is None:
        raise _not_found()
    return product


def list_products(db: Session, filters: ProductFilters, params: PageParams) -> Page[ProductOut]:
    page = paginate(db, repository.list_query(filters), params, lambda p: p)
    counts = invoice_counts(db, [p.id for p in page.items])
    return Page[ProductOut](
        items=[to_out(p, counts.get(p.id, 0)) for p in page.items],
        total=page.total,
        page=page.page,
        page_size=page.page_size,
    )


def get_detail(db: Session, product_id: int) -> ProductDetailOut:
    return _detail(db, get(db, product_id))


def _sku_taken(sku: str, other: Product) -> Conflict:
    return Conflict(f"{sku} is already used by “{other.name}”.", code="SKU_TAKEN")


def _check_sku(db: Session, sku: str, current_id: int | None = None) -> None:
    clash = repository.get_by_sku(db, sku)
    if clash and clash.id != current_id:
        raise _sku_taken(sku, clash)


def _check_category(db: Session, category_id: int | None) -> None:
    if category_id is None or not categories_service.exists(db, category_id):
        raise ValidationFailed("Choose a category.")


def _commit(db: Session, sku: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:  # a concurrent request took the SKU
        db.rollback()
        raise Conflict(f"{sku} is already in use.", code="SKU_TAKEN") from exc


def create_product(db: Session, data: ProductCreate) -> ProductOut:
    _check_sku(db, data.sku)
    _check_category(db, data.category_id)
    product = repository.add(
        db,
        Product(
            name=data.name,
            sku=data.sku,
            category_id=data.category_id,
            cost_price=data.cost_price,
            sell_price=data.sell_price,
            # PRD-4: new products start empty; stock arrives through an IN movement.
            quantity=0,
            min_quantity=data.min_quantity,
            description=data.description,
            is_active=data.is_active,
        ),
    )
    _commit(db, data.sku)
    db.refresh(product)
    return to_out(product)


def update_product(db: Session, product_id: int, data: ProductUpdate) -> ProductDetailOut:
    product = get(db, product_id)
    if "quantity" in data.model_fields_set:
        raise ValidationFailed(
            "Quantity changes only through stock movements and invoices.", code="QUANTITY_READ_ONLY"
        )
    if data.sku is not None:
        _check_sku(db, data.sku, current_id=product.id)
    if "category_id" in data.model_fields_set:
        _check_category(db, data.category_id)

    changes = data.model_dump(exclude_unset=True, exclude_none=True, exclude={"quantity"})
    for field, value in changes.items():
        setattr(product, field, value)
    _commit(db, product.sku)
    db.refresh(product)
    return _detail(db, product)


def delete_product(db: Session, product_id: int) -> DeleteResult:
    product = get(db, product_id)
    # PRD-2: products that appear on invoices are deactivated instead of deleted.
    if invoice_counts(db, [product.id]).get(product.id, 0) > 0:
        product.is_active = False
        db.commit()
        return DeleteResult(result="deactivated")
    db.delete(product)
    db.commit()
    return DeleteResult(result="deleted")
