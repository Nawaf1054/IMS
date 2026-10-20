"""Engine and request-scoped sessions."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    # Every timestamp is UTC (PRD §7), whatever the server's default zone is.
    connect_args={"options": "-c timezone=utc"},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one database session per request, closed when the request ends."""
    with SessionLocal() as session:
        yield session
