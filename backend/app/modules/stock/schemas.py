"""Stock movement schemas. Shape checks live here; stock rules (with their error codes) in the service."""

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.modules.stock.models import MovementType

MAX_NOTE_LENGTH = 1000


class MovementOut(BaseModel):
    """A stock movement as the API returns it."""

    id: int
    product_id: int
    product_name: str
    product_sku: str
    type: MovementType
    # Signed change: positive adds stock, negative removes it.
    quantity: int
    balance_after: int
    note: str
    # Set on SALE movements and on the reversals of a cancelled invoice.
    invoice_id: int | None
    invoice_number: str | None
    user_id: int
    user_name: str
    created_at: datetime


class MovementCreate(BaseModel):
    """POST /stock-movements.

    For IN and OUT `quantity` is the amount moved; for ADJUSTMENT it's the counted quantity on
    hand, and the movement records the difference.
    """

    product_id: int | None = None
    type: MovementType = Field(default=None, validate_default=True)  # type: ignore[assignment]
    quantity: int = Field(default=None, validate_default=True)  # type: ignore[assignment]
    note: str = ""

    @field_validator("type", mode="before")
    @classmethod
    def _type(cls, value: object) -> object:
        """Only the movement type names; anything else is rejected with a clear message."""
        if value not in {t.value for t in MovementType}:
            raise ValueError("Choose a movement type.")
        return value

    @field_validator("quantity", mode="before")
    @classmethod
    def _quantity(cls, value: object) -> object:
        """Accepts only real integers, so "5" or 2.5 get a clear error instead of being coerced."""
        # Strict: "5", 2.5 and true are rejected rather than coerced.
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Quantity must be a whole number.")
        return value

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        """Trims the note and limits its length."""
        note = value.strip()
        if len(note) > MAX_NOTE_LENGTH:
            raise ValueError(f"Keep the note under {MAX_NOTE_LENGTH} characters.")
        return note


class ProductMovementFilters(BaseModel):
    """GET /products/{id}/movements query (STK-5). Dates are inclusive business-local days."""

    type: MovementType | None = None
    start_date: date | None = None
    end_date: date | None = None


class MovementFilters(ProductMovementFilters):
    """GET /stock-movements query (STK-5)."""

    product_id: int | None = None
