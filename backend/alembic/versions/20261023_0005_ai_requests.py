"""ai_requests

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Creates ai_requests: one row per successful AI request, for the hourly limit (AI-8)."""
    op.create_table(
        "ai_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_ai_requests"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.id"], name="fk_ai_requests_user_id_profiles", ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "kind IN ('chat', 'insights', 'product_description')", name="ck_ai_requests_kind_known"
        ),
    )
    op.create_index("ix_ai_requests_user_id_created_at", "ai_requests", ["user_id", "created_at"])

    # Same as the other tables: keep Supabase's public Data API out (see 0001).
    op.execute("ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Drops ai_requests."""
    op.drop_table("ai_requests")
