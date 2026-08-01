"""Estrutura inicial versionada do Mercado+.

Revision ID: 20260731_01
Revises:
Create Date: 2026-07-31
"""
from typing import Sequence, Union

from alembic import op

from backend.app.database import Base
from backend.app import models  # noqa: F401


revision: str = "20260731_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    op.execute("CREATE SEQUENCE IF NOT EXISTS product_sku_seq START WITH 1")

    for table_name in (
        "suppliers", "products", "sales", "sale_items", "cash_closures",
        "cash_registers", "payment_settings", "stock_movements",
    ):
        op.execute(
            f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS "
            "company_key VARCHAR(64) NOT NULL DEFAULT 'legacy'"
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_company_idx ON {table_name} (company_key)")

    op.execute("ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ")
    op.execute("ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by_name VARCHAR(180)")
    op.execute("ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by_email VARCHAR(180)")
    op.execute("ALTER TABLE products ALTER COLUMN minimum_stock SET DEFAULT 5")
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key")
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key")
    op.execute("DROP INDEX IF EXISTS ix_products_sku")
    op.execute("DROP INDEX IF EXISTS ix_products_barcode")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_unique "
        "ON products (company_key, sku)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS products_company_barcode_unique "
        "ON products (company_key, barcode) WHERE barcode IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS payment_settings_company_unique "
        "ON payment_settings (company_key)"
    )
    op.execute(
        "ALTER TABLE cash_closures ADD COLUMN IF NOT EXISTS "
        "total_sales_count INTEGER NOT NULL DEFAULT 0"
    )


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
    op.execute("DROP SEQUENCE IF EXISTS product_sku_seq")
