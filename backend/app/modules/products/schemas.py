"""Product schemas. Validation messages match the frontend's mock API."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.common.money import Money, parse_money_input

PRICE_ERROR = "Prices must be zero or more, with up to two decimals."
MIN_QUANTITY_ERROR = "Minimum quantity must be a whole number, zero or more."

SortKey = Literal["name", "sku", "category", "cost_price", "sell_price", "quantity"]


class ProductOut(BaseModel):
    id: int
    name: str
    sku: str
    category_id: int
    category_name: str
    category_path: str
    cost_price: Money
    sell_price: Money
    # Read-only: changes only through stock movements and invoices (PRD-4).
    quantity: int
    min_quantity: int
    description: str
    is_active: bool
    is_low_stock: bool
    # Invoices this product appears on; > 0 means delete deactivates instead (PRD-2).
    invoice_count: int
    created_at: datetime
    updated_at: datetime


class SalesSummary(BaseModel):
    quantity: int
    revenue: Money
    invoice_count: int
    cancelled_count: int


class ProductDetailOut(ProductOut):
    sales_last_30_days: SalesSummary
    last_received_at: datetime | None


class DeleteResult(BaseModel):
    result: Literal["deleted", "deactivated"]


# ── Input ───────────────────────────────────────────────────────────────────


def _clean_name(value: str | None) -> str | None:
    if value is None:
        return None
    name = value.strip()
    if not name:
        raise ValueError("Name is required.")
    if len(name) > 200:
        raise ValueError("Keep the name under 200 characters.")
    return name


def _clean_sku(value: str | None) -> str | None:
    if value is None:
        return None
    sku = value.strip().upper()
    if not sku:
        raise ValueError("SKU is required.")
    if len(sku) > 64:
        raise ValueError("Keep the SKU under 64 characters.")
    return sku


def _parse_price(value: object) -> Decimal | None:
    if value is None:
        return None
    price = parse_money_input(value)
    if price is None:
        raise ValueError(PRICE_ERROR)
    return price


def _parse_min_quantity(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(MIN_QUANTITY_ERROR)
    return value


def _clean_description(value: str | None) -> str | None:
    return None if value is None else value.strip()


class ProductCreate(BaseModel):
    # Defaults are validated too, so a missing field gets the same message as an empty one.
    name: str = Field(default="", validate_default=True)
    sku: str = Field(default="", validate_default=True)
    category_id: int | None = None
    cost_price: Decimal = Field(default=Decimal("0"), validate_default=True)
    sell_price: Decimal = Field(default=Decimal("0"), validate_default=True)
    min_quantity: int = 0
    description: str = ""
    is_active: bool = True

    _name = field_validator("name")(_clean_name)
    _sku = field_validator("sku")(_clean_sku)
    _prices = field_validator("cost_price", "sell_price", mode="before")(_parse_price)
    _min_quantity = field_validator("min_quantity", mode="before")(_parse_min_quantity)
    _description = field_validator("description")(_clean_description)


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    category_id: int | None = None
    cost_price: Decimal | None = None
    sell_price: Decimal | None = None
    min_quantity: int | None = None
    description: str | None = None
    is_active: bool | None = None
    # Accepted only so it can be rejected with a clear error (PRD-4).
    quantity: object | None = None

    _name = field_validator("name")(_clean_name)
    _sku = field_validator("sku")(_clean_sku)
    _prices = field_validator("cost_price", "sell_price", mode="before")(_parse_price)
    _min_quantity = field_validator("min_quantity", mode="before")(_parse_min_quantity)
    _description = field_validator("description")(_clean_description)


class ProductFilters(BaseModel):
    """GET /products query (PRD-3)."""

    search: str | None = None
    category_id: int | None = None
    low_stock: bool = False
    include_inactive: bool = False
    sort: SortKey = "name"
    order: Literal["asc", "desc"] = "asc"
