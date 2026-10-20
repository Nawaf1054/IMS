"""Database queries for settings (SQLAlchemy, no business logic)."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.settings.models import Setting


def get_all(db: Session) -> dict[str, str]:
    """Every stored setting as a dict."""
    return {row.key: row.value for row in db.scalars(select(Setting))}


def upsert(db: Session, values: dict[str, str]) -> None:
    """Inserts or overwrites the given settings in one statement. Doesn't commit."""
    if not values:
        return
    stmt = insert(Setting).values([{"key": k, "value": v} for k, v in values.items()])
    db.execute(stmt.on_conflict_do_update(index_elements=[Setting.key], set_={"value": stmt.excluded.value}))
