"""invoices, invoice_items, invoice_sequences; stock_movements.invoice_id

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

invoice_status = sa.Enum("COMPLETED", "CANCELLED", name="invoice_status")
TABLES = ("invoices", "invoice_items", "invoice_sequences")


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_number", sa.String(20), nullable=False),
        sa.Column("customer_name", sa.String(120), nullable=True),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("discount", sa.Numeric(12, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 4), nullable=False),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", invoice_status, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_invoices"),
        sa.UniqueConstraint("invoice_number", name="uq_invoices_invoice_number"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.id"], name="fk_invoices_user_id_profiles", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["cancelled_by_id"],
            ["profiles.id"],
            name="fk_invoices_cancelled_by_id_profiles",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint("subtotal >= 0", name="ck_invoices_subtotal_non_negative"),
        sa.CheckConstraint(
            "discount >= 0 AND discount <= subtotal", name="ck_invoices_discount_within_subtotal"
        ),
        sa.CheckConstraint("tax_rate >= 0 AND tax_rate <= 1", name="ck_invoices_tax_rate_fraction"),
        sa.CheckConstraint("tax_amount >= 0", name="ck_invoices_tax_amount_non_negative"),
        sa.CheckConstraint("total = subtotal - discount + tax_amount", name="ck_invoices_total_adds_up"),
        sa.CheckConstraint(
            "(status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancelled_by_id IS NOT NULL)",
            name="ck_invoices_cancellation_recorded",
        ),
    )
    op.create_index("ix_invoices_created_at", "invoices", ["created_at"])

    op.create_table(
        "invoice_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_invoice_items"),
        sa.ForeignKeyConstraint(
            ["invoice_id"], ["invoices.id"], name="fk_invoice_items_invoice_id_invoices", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"], name="fk_invoice_items_product_id_products", ondelete="RESTRICT"
        ),
        sa.CheckConstraint("quantity > 0", name="ck_invoice_items_quantity_positive"),
        sa.CheckConstraint("unit_price >= 0", name="ck_invoice_items_unit_price_non_negative"),
        sa.CheckConstraint("line_total = quantity * unit_price", name="ck_invoice_items_line_total_matches"),
    )
    op.create_index("ix_invoice_items_invoice_id", "invoice_items", ["invoice_id"])
    op.create_index("ix_invoice_items_product_id", "invoice_items", ["product_id"])

    op.create_table(
        "invoice_sequences",
        sa.Column("year", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("last_number", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("year", name="pk_invoice_sequences"),
    )

    op.add_column("stock_movements", sa.Column("invoice_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_stock_movements_invoice_id_invoices",
        "stock_movements",
        "invoices",
        ["invoice_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_stock_movements_invoice_id", "stock_movements", ["invoice_id"])

    # Same as the other tables: keep Supabase's public Data API out (see 0001).
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_stock_movements_invoice_id", table_name="stock_movements")
    op.drop_constraint("fk_stock_movements_invoice_id_invoices", "stock_movements", type_="foreignkey")
    op.drop_column("stock_movements", "invoice_id")
    op.drop_table("invoice_sequences")
    op.drop_table("invoice_items")
    op.drop_table("invoices")
    invoice_status.drop(op.get_bind(), checkfirst=True)
