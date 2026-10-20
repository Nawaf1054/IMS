"""Business settings: stored values over defaults from the environment (INV-2)."""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.settings import repository
from app.modules.settings.schemas import BusinessSettingsOut, BusinessSettingsUpdate, format_rate

DEFAULT_BUSINESS_NAME = "My Business"


def _defaults() -> dict[str, str]:
    """Values used for settings that were never saved."""
    config = get_settings()
    return {
        "business_name": DEFAULT_BUSINESS_NAME,
        "business_address": "",
        "currency": config.default_currency,
        "tax_rate": format_rate(config.default_tax_rate),
    }


def read(db: Session) -> BusinessSettingsOut:
    """The current settings: saved values over the defaults."""
    values = _defaults() | repository.get_all(db)
    return BusinessSettingsOut(**{key: values[key] for key in BusinessSettingsOut.model_fields})


def update(db: Session, data: BusinessSettingsUpdate) -> BusinessSettingsOut:
    """Saves the changed settings and returns the result."""
    repository.upsert(db, data.model_dump(exclude_none=True))
    db.commit()
    return read(db)


def tax_rate(db: Session) -> Decimal:
    """The rate new invoices use (fraction, e.g. 0.15)."""
    return Decimal(read(db).tax_rate)
