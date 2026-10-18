"""Shared fixtures: a migrated test database, per-test rollback, an API client and auth helpers.

Tests use `<DATABASE_URL's database>_test` on the same server (or TEST_DATABASE_URL) and never
touch the dev data. Tokens are signed locally with an HS256 test secret, so no Supabase is needed.
"""

import os
from collections.abc import Iterator

# Settings must see test values before any app module is imported.
os.environ["SUPABASE_URL"] = "http://supabase.test"
os.environ["SUPABASE_JWT_SECRET"] = "test-jwt-secret-with-at-least-32-characters"
os.environ.setdefault("SUPABASE_SECRET_KEY", "sb_secret_test")

from sqlalchemy.engine import make_url

from app.core.config import get_settings

get_settings.cache_clear()
_dev_url = make_url(get_settings().database_url)
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or _dev_url.set(
    database=f"{_dev_url.database}_test"
).render_as_string(hide_password=False)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
get_settings.cache_clear()

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.security import get_token_verifier  # noqa: E402
from app.db.session import engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.auth.supabase_admin import get_auth_admin  # noqa: E402
from tests.factories import FakeAuthAdmin  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _create_test_database() -> None:
    url = make_url(TEST_DATABASE_URL)
    admin_engine = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": url.database})
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Iterator[None]:
    _create_test_database()
    config = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    config.attributes["database_url"] = TEST_DATABASE_URL
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    get_token_verifier.cache_clear()
    yield


@pytest.fixture
def db() -> Iterator[Session]:
    """A session whose work is rolled back after each test (commits become savepoints)."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def auth_admin() -> FakeAuthAdmin:
    return FakeAuthAdmin()


@pytest.fixture
def client(db: Session, auth_admin: FakeAuthAdmin) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_auth_admin] = lambda: auth_admin
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
