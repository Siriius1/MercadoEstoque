"""Importa o banco D1/SQLite local para o PostgreSQL do Mercado+."""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select, text

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.database import SessionLocal  # noqa: E402
from backend.app.main import initialize_database  # noqa: E402
from backend.app.models import Product, StockMovement, Supplier  # noqa: E402


def timestamp(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def locate_d1() -> Path:
    folder = PROJECT_ROOT / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"
    candidates = [path for path in folder.glob("*.sqlite") if path.name != "metadata.sqlite"]
    if not candidates:
        raise SystemExit("Banco D1 local não encontrado. Abra o site local ao menos uma vez.")
    return max(candidates, key=lambda path: path.stat().st_size)


def main() -> None:
    source_path = locate_d1()
    source = sqlite3.connect(source_path)
    source.row_factory = sqlite3.Row
    initialize_database()

    with SessionLocal() as target:
        if (target.scalar(select(func.count(Product.id))) or 0) > 0:
            print("O PostgreSQL já possui produtos; importação preservada sem duplicar dados.")
            return
        target.rollback()

        with target.begin():
            for row in source.execute("SELECT * FROM suppliers ORDER BY id"):
                target.add(
                    Supplier(
                        id=row["id"],
                        name=row["name"],
                        document=row["document"] or "",
                        contact=row["contact"] or "",
                        email=row["email"] or "",
                        phone=row["phone"] or "",
                        active=bool(row["active"]),
                        created_at=timestamp(row["created_at"]),
                        updated_at=timestamp(row["updated_at"]),
                    )
                )
            target.flush()

            product_columns = {
                row["name"] for row in source.execute("PRAGMA table_info(products)").fetchall()
            }
            for row in source.execute("SELECT * FROM products ORDER BY id"):
                target.add(
                    Product(
                        id=row["id"],
                        sku=row["sku"],
                        barcode=row["barcode"] if "barcode" in product_columns else None,
                        name=row["name"],
                        category=row["category"],
                        unit=row["unit"],
                        cost_price=row["cost_price"],
                        sale_price=row["sale_price"],
                        sale_price_updated_at=timestamp(row["sale_price_updated_at"]),
                        current_stock=row["current_stock"],
                        minimum_stock=row["minimum_stock"],
                        supplier_id=row["supplier_id"],
                        active=bool(row["active"]),
                        created_at=timestamp(row["created_at"]),
                        updated_at=timestamp(row["updated_at"]),
                    )
                )
            target.flush()

            for row in source.execute("SELECT * FROM movements ORDER BY id"):
                target.add(
                    StockMovement(
                        id=row["id"],
                        product_id=row["product_id"],
                        type=row["type"],
                        quantity=row["quantity"],
                        previous_stock=row["previous_stock"],
                        resulting_stock=row["resulting_stock"],
                        unit_cost=row["unit_cost"],
                        reason=row["reason"] or "",
                        notes=row["notes"] or "",
                        created_at=timestamp(row["created_at"]),
                    )
                )
            target.flush()

            for table_name in ("suppliers", "products", "stock_movements"):
                target.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                        f"GREATEST(COALESCE((SELECT MAX(id) FROM {table_name}), 1), 1), true)"
                    )
                )
            max_sku = target.scalar(
                text("SELECT COALESCE(MAX(NULLIF(regexp_replace(sku, '\\D', '', 'g'), '')::integer), 0) FROM products")
            )
            target.execute(text("SELECT setval('product_sku_seq', GREATEST(:value, 1), true)"), {"value": max_sku})

    supplier_total = source.execute("SELECT COUNT(*) FROM suppliers").fetchone()[0]
    product_total = source.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    movement_total = source.execute("SELECT COUNT(*) FROM movements").fetchone()[0]
    source.close()
    print(
        f"Importação concluída: {supplier_total} fornecedor(es), "
        f"{product_total} produto(s) e {movement_total} movimentação(ões)."
    )


if __name__ == "__main__":
    main()
