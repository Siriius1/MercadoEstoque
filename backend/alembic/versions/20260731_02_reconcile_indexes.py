"""Alinha índices e completa o histórico de fechamentos.

Revision ID: 20260731_02
Revises: 20260731_01
Create Date: 2026-07-31
"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260731_02"
down_revision: Union[str, None] = "20260731_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_products_name")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS payment_settings_company_unique "
        "ON payment_settings (company_key)"
    )
    op.execute(
        """
        UPDATE cash_closures AS closure
        SET total_sales_count = (
            SELECT COUNT(*)
            FROM sales AS sale
            WHERE sale.status = 'completed'
              AND sale.company_key = closure.company_key
              AND lower(sale.operator_email) = lower(closure.operator_email)
              AND sale.created_at >= closure.period_start
              AND sale.created_at <= closure.period_end
        )
        WHERE closure.total_sales_count = 0
        """
    )


def downgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_name ON products (name)")
