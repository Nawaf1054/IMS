"""stock_movements

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

movement_type = sa.Enum("IN", "OUT", "ADJUSTMENT", "SALE", name="movement_type")


def upgrade() -> None:
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("type", movement_type, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_stock_movements"),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"], name="fk_stock_movements_product_id_products", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.id"], name="fk_stock_movements_user_id_profiles", ondelete="RESTRICT"
        ),
        sa.CheckConstraint("quantity <> 0", name="ck_stock_movements_quantity_non_zero"),
        sa.CheckConstraint("balance_after >= 0", name="ck_stock_movements_balance_after_non_negative"),
    )
    op.create_index(
        "ix_stock_movements_product_id_created_at", "stock_movements", ["product_id", "created_at"]
    )
    op.create_index("ix_stock_movements_created_at", "stock_movements", ["created_at"])

    # Same as the other tables: keep Supabase's public Data API out (see 0001).
    op.execute("ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("stock_movements")
    movement_type.drop(op.get_bind(), checkfirst=True)
