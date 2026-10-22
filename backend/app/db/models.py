"""Model registry: importing this module loads every table onto Base.metadata (used by Alembic)."""

from app.db.base import Base
from app.modules.ai.models import AiRequest
from app.modules.categories.models import Category
from app.modules.invoices.models import Invoice, InvoiceItem, InvoiceSequence
from app.modules.products.models import Product
from app.modules.settings.models import Setting
from app.modules.stock.models import StockMovement
from app.modules.users.models import Profile

__all__ = [
    "AiRequest",
    "Base",
    "Category",
    "Invoice",
    "InvoiceItem",
    "InvoiceSequence",
    "Product",
    "Profile",
    "Setting",
    "StockMovement",
]
