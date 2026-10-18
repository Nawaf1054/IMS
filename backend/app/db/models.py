"""Model registry: importing this module loads every table onto Base.metadata (used by Alembic)."""

from app.db.base import Base
from app.modules.users.models import Profile

__all__ = ["Base", "Profile"]
