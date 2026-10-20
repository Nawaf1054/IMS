"""profiles: app users linked to Supabase Auth

Revision ID: 0001
Revises:
Create Date: 2026-10-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_role = sa.Enum("admin", "staff", name="user_role")


def upgrade() -> None:
    """Creates the profiles table and the user_role enum."""
    op.create_table(
        "profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auth_user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_profiles"),
        sa.UniqueConstraint("auth_user_id", name="uq_profiles_auth_user_id"),
        sa.UniqueConstraint("email", name="uq_profiles_email"),
    )
    # Row-level security with no policies: Supabase's public Data API (publishable key) can't
    # read the table. The backend connects as the table owner, which RLS doesn't apply to.
    op.execute("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drops the profiles table and the user_role enum."""
    op.drop_table("profiles")
    user_role.drop(op.get_bind(), checkfirst=True)
