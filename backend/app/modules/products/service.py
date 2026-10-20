"""Business rules for products (PRD-1 … PRD-5)."""

from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.pagination import Page, PageParams, paginate
from app.common.time import utcnow
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

SALES_WINDOW = timedelta(days=30)


def invoice_counts(db: Session, product_ids: list[int]) -> dict[int, int]:
    """Invoices (any status) each product appears on."""
    return repository.invoice_counts(db, product_ids)


def to_out(product: Product, invoice_count: int = 0) -> ProductOut:
    """The API view of a product."""
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
    """The product page view: the product plus its 30-day sales and last receipt."""
    base = to_out(product, invoice_counts(db, [product.id]).get(product.id, 0))
    sales = repository.sales_since(db, product.id, utcnow() - SALES_WINDOW)
    return ProductDetailOut(
        **base.model_dump(),
        sales_last_30_days=SalesSummary(
            quantity=sales.quantity,
            revenue=sales.revenue,
            invoice_count=sales.invoice_count,
            cancelled_count=sales.cancelled_count,
        ),
        last_received_at=repository.last_received_at(db, product.id),
    )


def _not_found() -> NotFound:
    """The error for an unknown product id."""
    return NotFound("Product not found.", code="PRODUCT_NOT_FOUND")


def get(db: Session, product_id: int) -> Product:
    """The product, or 404 PRODUCT_NOT_FOUND."""
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


def get_many_for_update(db: Session, product_ids: list[int]) -> dict[int, Product]:
    """Several products by id, locked until commit (in id order, so concurrent sales can't deadlock).
    Raises PRODUCT_NOT_FOUND if any is missing."""
    products = repository.get_many_for_update(db, sorted(set(product_ids)))
    if len(products) != len(set(product_ids)):
        raise _not_found()
    return products


def list_products(db: Session, filters: ProductFilters, params: PageParams) -> Page[ProductOut]:
    """One page of products with how many invoices each appears on."""
    page = paginate(db, repository.list_query(filters), params, lambda p: p)
    counts = invoice_counts(db, [p.id for p in page.items])
    return Page[ProductOut](
        items=[to_out(p, counts.get(p.id, 0)) for p in page.items],
        total=page.total,
        page=page.page,
        page_size=page.page_size,
    )


def export_rows(db: Session, filters: ProductFilters, limit: int) -> list[repository.ExportRow]:
    """Products for the Excel export (EXP-1, EXP-5): the same filters and order as the list."""
    return repository.export_rows(db, filters, limit)


def get_detail(db: Session, product_id: int) -> ProductDetailOut:
    """The product page view, or 404."""
    return _detail(db, get(db, product_id))


def _sku_taken(sku: str, other: Product) -> Conflict:
    """The error for a SKU another product already uses."""
    return Conflict(f"{sku} is already used by “{other.name}”.", code="SKU_TAKEN")


def _check_sku(db: Session, sku: str, current_id: int | None = None) -> None:
    """Refuses a SKU that belongs to a different product."""
    clash = repository.get_by_sku(db, sku)
    if clash and clash.id != current_id:
        raise _sku_taken(sku, clash)


def _check_category(db: Session, category_id: int | None) -> None:
    """Refuses a missing or unknown category."""
    if category_id is None or not categories_service.exists(db, category_id):
        raise ValidationFailed("Choose a category.")


def _commit(db: Session, sku: str) -> None:
    """Commits, turning a unique-SKU race with another request into SKU_TAKEN."""
    try:
        db.commit()
    except IntegrityError as exc:  # a concurrent request took the SKU
        db.rollback()
        raise Conflict(f"{sku} is already in use.", code="SKU_TAKEN") from exc


def create_product(db: Session, data: ProductCreate) -> ProductOut:
    """Creates a product with zero stock (PRD-1, PRD-4)."""
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
    """Edits a product. Changing `quantity` here is refused: stock moves only via movements."""
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
    """Deletes a never-invoiced product; deactivates one that appears on invoices (PRD-2)."""
    product = get(db, product_id)
    # PRD-2: products that appear on invoices are deactivated instead of deleted.
    if invoice_counts(db, [product.id]).get(product.id, 0) > 0:
        product.is_active = False
        db.commit()
        return DeleteResult(result="deactivated")
    db.delete(product)
    db.commit()
    return DeleteResult(result="deleted")
