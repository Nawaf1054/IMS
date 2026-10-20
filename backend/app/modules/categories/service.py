"""Business rules for categories (CAT-1 … CAT-3)."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound, ValidationFailed
from app.modules.categories import repository
from app.modules.categories.models import Category
from app.modules.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate


def _out(category: Category, counts: dict[int, int]) -> CategoryOut:
    """The API view of a category, with its product count from `counts`."""
    return CategoryOut(
        id=category.id,
        name=category.name,
        parent_id=category.parent_id,
        product_count=counts.get(category.id, 0),
        created_at=category.created_at,
    )


def _name_exists(name: str) -> Conflict:
    """The error for a name that's already taken."""
    return Conflict(f"“{name}” already exists. Category names must be unique.", code="CATEGORY_EXISTS")


def _plural(count: int, word: str) -> str:
    """`1 product` / `3 products`."""
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def get(db: Session, category_id: int) -> Category:
    """The category, or 404 CATEGORY_NOT_FOUND."""
    category = repository.get(db, category_id)
    if category is None:
        raise NotFound("Category not found.", code="CATEGORY_NOT_FOUND")
    return category


def exists(db: Session, category_id: int) -> bool:
    """Whether a category with this id exists."""
    return repository.get(db, category_id) is not None


def list_categories(db: Session) -> list[CategoryOut]:
    """Every category with its product count (two queries in total)."""
    counts = repository.product_counts(db)
    return [_out(c, counts) for c in repository.list_all(db)]


def _check(db: Session, name: str, parent_id: int | None, current: Category | None = None) -> None:
    """Validates a name and parent: unique name, existing parent, one level of nesting only (CAT-2)."""
    clash = repository.get_by_name(db, name)
    if clash and (current is None or clash.id != current.id):
        raise _name_exists(name)
    if parent_id is None:
        return
    parent = repository.get(db, parent_id)
    if parent is None:
        raise ValidationFailed("Parent category not found.")
    # CAT-2: one level of subcategories.
    if parent.parent_id is not None:
        raise ValidationFailed("Subcategories can’t have their own subcategories.", code="NESTING_TOO_DEEP")
    if current is not None:
        if parent.id == current.id:
            raise ValidationFailed("A category can’t be its own parent.")
        if repository.children(db, current.id):
            raise ValidationFailed(
                "This category has subcategories, so it can’t become a subcategory itself.",
                code="NESTING_TOO_DEEP",
            )


def _commit(db: Session, name: str) -> None:
    """Commits, turning a unique-name race with another request into CATEGORY_EXISTS."""
    try:
        db.commit()
    except IntegrityError as exc:  # a concurrent request took the name
        db.rollback()
        raise _name_exists(name) from exc


def create_category(db: Session, data: CategoryCreate) -> CategoryOut:
    """Creates a category after the name and nesting checks."""
    _check(db, data.name, data.parent_id)
    category = repository.add(db, Category(name=data.name, parent_id=data.parent_id))
    _commit(db, data.name)
    return _out(category, {})


def update_category(db: Session, category_id: int, data: CategoryUpdate) -> CategoryOut:
    """Renames and/or moves a category. Fields left out of the request keep their value."""
    category = get(db, category_id)
    name = data.name if data.name is not None else category.name
    parent_id = data.parent_id if "parent_id" in data.model_fields_set else category.parent_id
    _check(db, name, parent_id, current=category)
    category.name = name
    category.parent_id = parent_id
    _commit(db, name)
    db.refresh(category)
    return _out(category, repository.product_counts(db))


def delete_category(db: Session, category_id: int) -> None:
    """Deletes a category and its empty subcategories; refuses if any of them hold products (CAT-3)."""
    category = get(db, category_id)
    children = repository.children(db, category.id)
    # CAT-3: a category with products can't be deleted.
    direct = repository.count_products_in(db, [category.id])
    if direct:
        verb = "is" if direct == 1 else "are"
        raise Conflict(
            f"{_plural(direct, 'product')} {verb} assigned to {category.name}. "
            "Move them to another category or deactivate them, then try again.",
            code="CATEGORY_NOT_EMPTY",
        )
    nested = repository.count_products_in(db, [c.id for c in children])
    if nested:
        names = ", ".join(c.name for c in children)
        raise Conflict(
            f"Its subcategories ({names}) hold {_plural(nested, 'product')}. Empty them first.",
            code="CATEGORY_NOT_EMPTY",
        )
    db.delete(category)  # empty subcategories go with it (ON DELETE CASCADE)
    db.commit()
