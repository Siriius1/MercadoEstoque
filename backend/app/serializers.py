from decimal import Decimal

from .models import Product, StockMovement, Supplier


def number(value: Decimal | int | float | None) -> float:
    return float(value or 0)


def product_json(product: Product) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "barcode": product.barcode or "",
        "name": product.name,
        "category": product.category,
        "unit": product.unit,
        "costPrice": number(product.cost_price),
        "salePrice": number(product.sale_price),
        "salePriceUpdatedAt": product.sale_price_updated_at.isoformat() if product.sale_price_updated_at else None,
        "currentStock": number(product.current_stock),
        "minimumStock": number(product.minimum_stock),
        "supplierId": product.supplier_id,
        "supplierName": product.supplier.name if product.supplier else None,
        "active": product.active,
    }


def supplier_json(supplier: Supplier, product_count: int = 0) -> dict:
    return {
        "id": supplier.id,
        "name": supplier.name,
        "document": supplier.document,
        "contact": supplier.contact,
        "email": supplier.email,
        "phone": supplier.phone,
        "productCount": product_count,
        "active": supplier.active,
    }


def movement_json(movement: StockMovement) -> dict:
    return {
        "id": movement.id,
        "productId": movement.product_id,
        "productName": movement.product.name,
        "sku": movement.product.sku,
        "unit": movement.product.unit,
        "type": movement.type,
        "quantity": number(movement.quantity),
        "previousStock": number(movement.previous_stock),
        "resultingStock": number(movement.resulting_stock),
        "unitCost": number(movement.unit_cost),
        "reason": movement.reason,
        "notes": movement.notes,
        "saleId": movement.sale_id,
        "operatorName": movement.operator_name,
        "createdAt": movement.created_at.isoformat(),
    }
