"""Model registry: importing this module loads every table onto Base.metadata (used by Alembic)."""

from app.db.base import Base
from app.modules.categories.models import Category
from app.modules.products.models import Product
from app.modules.settings.models import Setting
from app.modules.users.models import Profile

__all__ = ["Base", "Category", "Product", "Profile", "Setting"]
