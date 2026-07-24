from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .config import get_settings
from .database import Base, engine, get_db
from .models import Product, Sale, SaleItem, StockMovement, Supplier
from .schemas import MovementInput, ProductInput, SaleInput, SupplierInput
from .serializers import movement_json, number, product_json, supplier_json


CENT = Decimal("0.01")


def initialize_database() -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE SEQUENCE IF NOT EXISTS product_sku_seq START WITH 1"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Mercado+ API", version="0.1.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "postgresql"}


def find_product(db: Session, product_id: int, lock: bool = False) -> Product:
    statement = select(Product).where(Product.id == product_id)
    if lock:
        statement = statement.with_for_update()
    product = db.scalar(statement)
    if not product:
        raise HTTPException(404, "Produto não encontrado.")
    return product


def validate_supplier(db: Session, supplier_id: int | None) -> None:
    if supplier_id is not None and not db.get(Supplier, supplier_id):
        raise HTTPException(400, "Fornecedor não encontrado.")


@app.get("/api/products")
def list_products(
    search: str = Query(default="", max_length=180),
    db: Session = Depends(get_db),
) -> dict:
    statement = select(Product).options(joinedload(Product.supplier)).order_by(func.lower(Product.name), Product.id)
    if search.strip():
        term = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.barcode.ilike(term),
                Product.category.ilike(term),
            )
        )
    products = db.scalars(statement).unique().all()
    return {"products": [product_json(product) for product in products]}


@app.post("/api/products", status_code=201)
def create_product(payload: ProductInput, db: Session = Depends(get_db)) -> dict:
    validate_supplier(db, payload.supplierId)
    try:
        sequence_value = db.scalar(select(func.nextval("product_sku_seq")))
        product = Product(
            sku=f"#{int(sequence_value):04d}",
            barcode=payload.barcode,
            name=payload.name.strip(),
            category=payload.category.strip() or "Mercearia",
            unit=payload.unit,
            cost_price=payload.costPrice,
            sale_price=payload.salePrice,
            current_stock=payload.currentStock,
            minimum_stock=payload.minimumStock,
            supplier_id=payload.supplierId,
        )
        db.add(product)
        db.flush()
        if payload.currentStock > 0:
            db.add(
                StockMovement(
                    product_id=product.id,
                    type="entrada",
                    quantity=payload.currentStock,
                    previous_stock=0,
                    resulting_stock=payload.currentStock,
                    unit_cost=payload.costPrice,
                    reason="Estoque inicial",
                )
            )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "barcode" in str(exc).lower():
            raise HTTPException(409, "Este código de barras já está cadastrado.") from exc
        raise
    db.refresh(product)
    product = db.scalar(select(Product).options(joinedload(Product.supplier)).where(Product.id == product.id))
    return {"product": product_json(product)}


@app.put("/api/products/{product_id}")
def update_product(product_id: int, payload: ProductInput, db: Session = Depends(get_db)) -> dict:
    validate_supplier(db, payload.supplierId)
    product = find_product(db, product_id, lock=True)
    sale_price_changed = Decimal(product.sale_price) != payload.salePrice
    product.name = payload.name.strip()
    product.barcode = payload.barcode
    product.category = payload.category.strip() or "Mercearia"
    product.unit = payload.unit
    product.cost_price = payload.costPrice
    product.sale_price = payload.salePrice
    product.minimum_stock = payload.minimumStock
    product.supplier_id = payload.supplierId
    if sale_price_changed:
        product.sale_price_updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "barcode" in str(exc).lower():
            raise HTTPException(409, "Este código de barras já está cadastrado.") from exc
        raise
    product = db.scalar(select(Product).options(joinedload(Product.supplier)).where(Product.id == product_id))
    return {"product": product_json(product)}


@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)) -> dict:
    product = find_product(db, product_id)
    db.delete(product)
    db.commit()
    return {"deleted": True}


@app.get("/api/suppliers")
def list_suppliers(db: Session = Depends(get_db)) -> dict:
    counts = dict(
        db.execute(
            select(Product.supplier_id, func.count(Product.id))
            .where(Product.supplier_id.is_not(None))
            .group_by(Product.supplier_id)
        ).all()
    )
    suppliers = db.scalars(select(Supplier).order_by(func.lower(Supplier.name), Supplier.id)).all()
    return {"suppliers": [supplier_json(supplier, counts.get(supplier.id, 0)) for supplier in suppliers]}


@app.post("/api/suppliers", status_code=201)
def create_supplier(payload: SupplierInput, db: Session = Depends(get_db)) -> dict:
    supplier = Supplier(
        name=payload.name.strip(),
        document=payload.document.strip(),
        contact=payload.contact.strip(),
        email=payload.email.strip().lower(),
        phone=payload.phone.strip(),
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return {"supplier": supplier_json(supplier)}


@app.put("/api/suppliers/{supplier_id}")
def update_supplier(supplier_id: int, payload: SupplierInput, db: Session = Depends(get_db)) -> dict:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(404, "Fornecedor não encontrado.")
    supplier.name = payload.name.strip()
    supplier.document = payload.document.strip()
    supplier.contact = payload.contact.strip()
    supplier.email = payload.email.strip().lower()
    supplier.phone = payload.phone.strip()
    db.commit()
    count = db.scalar(select(func.count(Product.id)).where(Product.supplier_id == supplier.id)) or 0
    return {"supplier": supplier_json(supplier, count)}


@app.delete("/api/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)) -> dict:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(404, "Fornecedor não encontrado.")
    count = db.scalar(select(func.count(Product.id)).where(Product.supplier_id == supplier.id)) or 0
    db.delete(supplier)
    db.commit()
    return {"deleted": True, "deletedProducts": count}


@app.get("/api/movements")
def list_movements(db: Session = Depends(get_db)) -> dict:
    movements = db.scalars(
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(1000)
    ).unique().all()
    return {"movements": [movement_json(movement) for movement in movements]}


@app.post("/api/movements", status_code=201)
def create_movement(payload: MovementInput, db: Session = Depends(get_db)) -> dict:
    with db.begin():
        product = find_product(db, payload.productId, lock=True)
        previous = Decimal(product.current_stock)
        if payload.type == "entrada":
            resulting = previous + payload.quantity
        elif payload.type == "saida":
            resulting = previous - payload.quantity
            if resulting < 0:
                raise HTTPException(409, f"Estoque insuficiente. Disponível: {number(previous)} {product.unit}.")
        else:
            resulting = payload.quantity
        product.current_stock = resulting
        movement = StockMovement(
            product_id=product.id,
            type=payload.type,
            quantity=payload.quantity if payload.type != "ajuste" else abs(resulting - previous),
            previous_stock=previous,
            resulting_stock=resulting,
            unit_cost=payload.unitCost,
            reason=payload.reason.strip(),
            notes=payload.notes.strip(),
            operator_name=payload.operatorName.strip(),
        )
        db.add(movement)
    movement = db.scalar(
        select(StockMovement).options(joinedload(StockMovement.product)).where(StockMovement.id == movement.id)
    )
    return {"movement": movement_json(movement)}


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict:
    products = db.scalars(select(Product).options(joinedload(Product.supplier))).unique().all()
    supplier_count = db.scalar(select(func.count(Supplier.id)).where(Supplier.active.is_(True))) or 0
    recent = db.scalars(
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(6)
    ).unique().all()
    active = [product for product in products if product.active]
    summary = {
        "totalProducts": len(active),
        "lowStock": sum(product.current_stock <= product.minimum_stock for product in active),
        "stockValue": sum(number(product.current_stock * product.cost_price) for product in active),
        "retailValue": sum(number(product.current_stock * product.sale_price) for product in active),
        "totalSuppliers": supplier_count,
    }
    return {"summary": summary, "recent": [movement_json(movement) for movement in recent]}


@app.post("/api/sales", status_code=201)
def create_sale(payload: SaleInput, db: Session = Depends(get_db)) -> dict:
    requested: dict[int, Decimal] = defaultdict(Decimal)
    for line in payload.items:
        requested[line.productId] += line.quantity

    with db.begin():
        products = db.scalars(
            select(Product)
            .where(Product.id.in_(sorted(requested)))
            .order_by(Product.id)
            .with_for_update()
        ).all()
        by_id = {product.id: product for product in products}
        missing = sorted(set(requested) - set(by_id))
        if missing:
            raise HTTPException(404, f"Produto não encontrado: {missing[0]}.")

        for product_id, quantity in requested.items():
            product = by_id[product_id]
            if not product.active:
                raise HTTPException(409, f"{product.name} não está disponível para venda.")
            if product.current_stock < quantity:
                raise HTTPException(
                    409,
                    f"Estoque insuficiente para {product.name}. Disponível: {number(product.current_stock)} {product.unit}.",
                )

        total = sum(
            (by_id[product_id].sale_price * quantity).quantize(CENT, rounding=ROUND_HALF_UP)
            for product_id, quantity in requested.items()
        ).quantize(CENT, rounding=ROUND_HALF_UP)
        sale = Sale(
            payment_method=payload.paymentMethod,
            total=total,
            operator_name=payload.operatorName.strip(),
            operator_email=payload.operatorEmail.strip().lower(),
        )
        db.add(sale)
        db.flush()

        for product_id in sorted(requested):
            product = by_id[product_id]
            quantity = requested[product_id]
            previous = Decimal(product.current_stock)
            resulting = previous - quantity
            subtotal = (Decimal(product.sale_price) * quantity).quantize(CENT, rounding=ROUND_HALF_UP)
            db.add(
                SaleItem(
                    sale=sale,
                    product_id=product.id,
                    product_name=product.name,
                    product_sku=product.sku,
                    unit=product.unit,
                    quantity=quantity,
                    unit_price=product.sale_price,
                    subtotal=subtotal,
                )
            )
            db.add(
                StockMovement(
                    product_id=product.id,
                    sale_id=sale.id,
                    type="saida",
                    quantity=quantity,
                    previous_stock=previous,
                    resulting_stock=resulting,
                    unit_cost=product.cost_price,
                    reason=f"Venda #{sale.id}",
                    notes=f"Total da compra: R$ {total:.2f} · Pagamento: {payload.paymentMethod}",
                    operator_name=payload.operatorName.strip(),
                )
            )
            product.current_stock = resulting

    return {
        "sale": {
            "id": sale.id,
            "status": sale.status,
            "paymentMethod": sale.payment_method,
            "total": number(sale.total),
            "operatorName": sale.operator_name,
            "createdAt": sale.created_at.isoformat(),
            "items": [
                {
                    "productId": item.product_id,
                    "productName": item.product_name,
                    "sku": item.product_sku,
                    "unit": item.unit,
                    "quantity": number(item.quantity),
                    "unitPrice": number(item.unit_price),
                    "subtotal": number(item.subtotal),
                }
                for item in sale.items
            ],
        }
    }


@app.get("/api/sales")
def list_sales(db: Session = Depends(get_db)) -> dict:
    sales = db.scalars(
        select(Sale).options(joinedload(Sale.items)).order_by(Sale.created_at.desc(), Sale.id.desc()).limit(200)
    ).unique().all()
    return {
        "sales": [
            {
                "id": sale.id,
                "status": sale.status,
                "paymentMethod": sale.payment_method,
                "total": number(sale.total),
                "operatorName": sale.operator_name,
                "operatorEmail": sale.operator_email,
                "createdAt": sale.created_at.isoformat(),
                "itemCount": sum(number(item.quantity) for item in sale.items),
                "items": [
                    {
                        "productName": item.product_name,
                        "sku": item.product_sku,
                        "quantity": number(item.quantity),
                        "unit": item.unit,
                        "unitPrice": number(item.unit_price),
                        "subtotal": number(item.subtotal),
                    }
                    for item in sale.items
                ],
            }
            for sale in sales
        ]
    }
