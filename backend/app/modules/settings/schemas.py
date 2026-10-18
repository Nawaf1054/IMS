"""Business settings schemas. Validation messages match the frontend's mock API."""

from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, field_validator

SUPPORTED_CURRENCIES = ("SAR", "AED", "KWD", "USD")


def format_rate(rate: Decimal) -> str:
    """Decimal("0.150") -> "0.15", Decimal("0") -> "0"."""
    text = format(rate.normalize(), "f")
    return text


class BusinessSettingsOut(BaseModel):
    business_name: str
    business_address: str
    currency: str
    # Fraction as a string, e.g. "0.15" for 15%.
    tax_rate: str


class BusinessSettingsUpdate(BaseModel):
    business_name: str | None = None
    business_address: str | None = None
    currency: str | None = None
    tax_rate: str | None = None

    @field_validator("business_name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.strip():
            raise ValueError("Business name is required. It appears on every invoice.")
        return value.strip()

    @field_validator("business_address")
    @classmethod
    def _address(cls, value: str | None) -> str | None:
        return None if value is None else value.strip()

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        if value is not None and value not in SUPPORTED_CURRENCIES:
            raise ValueError("Unsupported currency.")
        return value

    @field_validator("tax_rate", mode="before")
    @classmethod
    def _tax_rate(cls, value: object) -> str | None:
        if value is None:
            return None
        try:
            rate = Decimal(str(value).strip())
        except InvalidOperation:
            rate = Decimal("NaN")
        if not rate.is_finite() or rate < 0 or rate > 1:
            raise ValueError("Enter a rate between 0 and 100.")
        return format_rate(rate)
