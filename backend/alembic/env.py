"""Alembic environment. Alembic owns the app schema; Supabase's own schemas (auth, storage…) are left alone."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.db.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def database_url() -> str:
    """The database to migrate: the URL a test passed in, otherwise DATABASE_URL."""
    # Tests pass their own URL via `config.attributes`.
    return config.attributes.get("database_url") or get_settings().database_url


def include_object(obj, name, type_, reflected, compare_to):
    """Tells autogenerate to ignore tables it finds in the database but that the app doesn't model."""
    # Only compare tables in the public schema that we model.
    return not (type_ == "table" and reflected and compare_to is None)


def run_migrations_offline() -> None:
    """Writes the migration SQL out instead of running it (`alembic upgrade --sql`)."""
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connects to the database and applies the pending migrations in one transaction."""
    connectable = create_engine(database_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, include_object=include_object
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
