"""Money is Decimal in Python and NUMERIC(12,2) in Postgres; it travels as a decimal string. Never floats."""

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import PlainSerializer

CENT = Decimal("0.01")
# Largest amount a NUMERIC(12, 2) column holds.
MAX_MONEY = Decimal("9999999999.99")
# What a money field may hold: "12", "12.5", ".5", "12.345" (rounded half-up to cents). No sign.
MONEY_INPUT = re.compile(r"^\d*(?:\.\d*)?$")


def to_money(value: Decimal | int | str) -> Decimal:
    """Rounds to cents, half-up (the usual rule on receipts)."""
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def parse_money_input(value: object) -> Decimal | None:
    """An amount typed by a user ("12", "12.5", ".5") rounded to cents, or None if it isn't one."""
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    if not text or text == "." or not MONEY_INPUT.match(text):
        return None
    amount = to_money(text)
    return amount if amount <= MAX_MONEY else None


# Response field type: serialized as "12.50" so no precision is lost in JSON.
Money = Annotated[Decimal, PlainSerializer(lambda v: f"{to_money(v):.2f}", return_type=str, when_used="json")]

# Fractions such as tax rates ("0.15"), serialized without trailing zeros.
Rate = Annotated[
    Decimal, PlainSerializer(lambda v: format(v.normalize(), "f"), return_type=str, when_used="json")
]
