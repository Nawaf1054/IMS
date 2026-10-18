"""Money is Decimal in Python and NUMERIC(12,2) in Postgres; it travels as a decimal string. Never floats."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import PlainSerializer

CENT = Decimal("0.01")


def to_money(value: Decimal | int | str) -> Decimal:
    """Rounds to cents, half-up (the usual rule on receipts)."""
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


# Response field type: serialized as "12.50" so no precision is lost in JSON.
Money = Annotated[Decimal, PlainSerializer(lambda v: f"{to_money(v):.2f}", return_type=str, when_used="json")]

# Fractions such as tax rates ("0.15"), serialized without trailing zeros.
Rate = Annotated[
    Decimal, PlainSerializer(lambda v: format(v.normalize(), "f"), return_type=str, when_used="json")
]
