from collections import defaultdict
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, event, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .config import get_settings
from .database import Base, engine, get_db
from .models import CashClosure, CashRegister, PaymentSettings, Product, Sale, SaleItem, StockMovement, Supplier
from .schemas import (
    CancelSaleInput,
    CashClosureInput,
    CashRegisterOpenInput,
    GoogleCredentialInput,
    MovementInput,
    ProductInput,
    PixPaymentSettingsInput,
    SaleInput,
    SupplierInput,
)
from .serializers import movement_json, number, product_json, supplier_json


CENT = Decimal("0.01")
tenant_context: ContextVar[str] = ContextVar("mercado_tenant", default="")
TENANT_MODELS = (Supplier, Product, Sale, SaleItem, CashClosure, CashRegister, PaymentSettings, StockMovement)


def current_tenant() -> str:
    company_key = tenant_context.get()
    if not company_key:
        raise HTTPException(401, "Estabelecimento não identificado.")
    return company_key


@event.listens_for(Session, "do_orm_execute")
def isolate_company_data(execute_state) -> None:
    """Aplica o filtro da empresa no servidor, inclusive quando uma rota esquecer de fazê-lo."""
    company_key = tenant_context.get()
    if not company_key or not execute_state.is_orm_statement:
        return
    from sqlalchemy.orm import with_loader_criteria

    statement = execute_state.statement
    for model in TENANT_MODELS:
        statement = statement.options(
            with_loader_criteria(model, lambda cls: cls.company_key == company_key, include_aliases=True)
        )
    execute_state.statement = statement


@event.listens_for(Session, "before_flush")
def assign_company_to_new_records(session, _flush_context, _instances) -> None:
    company_key = tenant_context.get()
    if not company_key:
        return
    for record in session.new:
        if isinstance(record, TENANT_MODELS):
            record.company_key = company_key


def initialize_database() -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE SEQUENCE IF NOT EXISTS product_sku_seq START WITH 1"))
        connection.execute(text("ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ"))
        connection.execute(text("ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by_name VARCHAR(180)"))
        connection.execute(text("ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by_email VARCHAR(180)"))
        connection.execute(text("ALTER TABLE products ALTER COLUMN minimum_stock SET DEFAULT 5"))
        for table_name in (
            "suppliers", "products", "sales", "sale_items", "cash_closures",
            "cash_registers", "payment_settings", "stock_movements",
        ):
            connection.execute(text(
                f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS company_key VARCHAR(64) NOT NULL DEFAULT 'legacy'"
            ))
            connection.execute(text(
                f"CREATE INDEX IF NOT EXISTS {table_name}_company_idx ON {table_name} (company_key)"
            ))
        connection.execute(text("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key"))
        connection.execute(text("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key"))
        # Versões anteriores criavam estes campos como índices únicos globais.
        # Agora a mesma numeração pode existir em empresas diferentes.
        connection.execute(text("DROP INDEX IF EXISTS ix_products_sku"))
        connection.execute(text("DROP INDEX IF EXISTS ix_products_barcode"))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_unique "
            "ON products (company_key, sku)"
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS products_company_barcode_unique "
            "ON products (company_key, barcode) WHERE barcode IS NOT NULL"
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS payment_settings_company_unique "
            "ON payment_settings (company_key)"
        ))
        connection.execute(
            text(
                "ALTER TABLE cash_closures "
                "ADD COLUMN IF NOT EXISTS total_sales_count INTEGER NOT NULL DEFAULT 0"
            )
        )
        connection.execute(
            text(
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
        )


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


@app.middleware("http")
async def identify_company(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.url.path != "/api/auth/google-profile":
        company_key = request.headers.get("X-Mercado-Tenant", "").strip()
        if not company_key:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Estabelecimento não identificado."}, status_code=401)
        context_token = tenant_context.set(company_key)
        try:
            return await call_next(request)
        finally:
            tenant_context.reset(context_token)
    return await call_next(request)


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "postgresql"}


@app.post("/api/auth/google-profile")
async def google_profile(payload: GoogleCredentialInput) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": payload.credential},
            )
    except httpx.HTTPError as error:
        raise HTTPException(502, "Não foi possível consultar o Google.") from error
    if response.status_code != 200:
        raise HTTPException(401, "O Google não conseguiu validar esta identificação.")
    info = response.json()
    if info.get("aud") != settings.google_client_id:
        raise HTTPException(401, "Credencial destinada a outro aplicativo.")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Emissor Google inválido.")
    if int(info.get("exp", 0)) * 1000 <= datetime.now(timezone.utc).timestamp() * 1000:
        raise HTTPException(401, "A autenticação Google expirou.")
    if not info.get("sub") or not info.get("email") or str(info.get("email_verified")).lower() != "true":
        raise HTTPException(401, "O Google não confirmou este e-mail.")
    email = str(info["email"]).lower()
    return {
        "profile": {
            "sub": str(info["sub"]),
            "email": email,
            "name": str(info.get("name") or email.split("@")[0]).strip(),
            "authoritative": email.endswith("@gmail.com") or bool(info.get("hd")),
        }
    }


@app.post("/api/demo/seed")
def seed_demo_company(db: Session = Depends(get_db)) -> dict:
    """Cria dados realistas somente dentro da empresa temporária da demonstração."""
    if db.scalar(select(func.count(Product.id))) > 0:
        return {"seeded": False}
    supplier = Supplier(
            name="Distribuidora Modelo",
            document="12.345.678/0001-90",
            contact="Equipe comercial",
            email="pedidos@distribuidora.demo",
            phone="(11) 4000-2026",
    )
    db.add(supplier)
    db.flush()
    samples = [
            ("#0001", "Arroz", "Grãos", "pct", Decimal("18.50"), Decimal("25.90"), Decimal("15")),
            ("#0002", "Café", "Mercearia", "un", Decimal("12.00"), Decimal("18.00"), Decimal("20")),
            ("#0003", "Feijão", "Grãos", "pct", Decimal("6.20"), Decimal("10.99"), Decimal("9")),
            ("#0004", "Leite", "Laticínios", "un", Decimal("4.89"), Decimal("6.49"), Decimal("24")),
            ("#0005", "Macarrão", "Massas", "un", Decimal("3.20"), Decimal("6.00"), Decimal("18")),
    ]
    for sku, name, category, unit, cost, price, stock in samples:
        product = Product(
                sku=sku,
                name=name,
                category=category,
                unit=unit,
                cost_price=cost,
                sale_price=price,
                current_stock=stock,
                minimum_stock=5,
                supplier_id=supplier.id,
        )
        db.add(product)
        db.flush()
        db.add(StockMovement(
                product_id=product.id,
                type="entrada",
                quantity=stock,
                previous_stock=0,
                resulting_stock=stock,
                unit_cost=cost,
                reason="Estoque inicial da demonstração",
                operator_name="Administrador de demonstração",
        ))
    db.commit()
    return {"seeded": True}


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


def pix_settings_json(settings_record: PaymentSettings | None) -> dict:
    if not settings_record:
        return {
            "enabled": False,
            "keyType": "cnpj",
            "key": "",
            "receiverName": "",
            "city": "",
            "updatedAt": None,
        }
    return {
        "enabled": settings_record.pix_enabled,
        "keyType": settings_record.pix_key_type,
        "key": settings_record.pix_key,
        "receiverName": settings_record.pix_receiver_name,
        "city": settings_record.pix_city,
        "updatedAt": settings_record.updated_at.isoformat() if settings_record.updated_at else None,
    }


def validate_pix_settings(payload: PixPaymentSettingsInput) -> None:
    if not payload.enabled:
        return
    key = payload.key
    valid_key = (
        (payload.keyType == "cpf" and len(key) == 11 and key.isdigit())
        or (payload.keyType == "cnpj" and len(key) == 14 and key.isdigit())
        or (payload.keyType == "telefone" and key.startswith("+55") and key[1:].isdigit() and len(key) in (13, 14))
        or (payload.keyType == "email" and "@" in key and "." in key.rsplit("@", 1)[-1])
        or (payload.keyType == "aleatoria" and 8 <= len(key) <= 77)
    )
    if not valid_key:
        raise HTTPException(400, "Informe uma chave PIX válida para o tipo selecionado.")
    if len(payload.receiverName) < 2:
        raise HTTPException(400, "Informe o nome do recebedor.")
    if len(payload.city) < 2:
        raise HTTPException(400, "Informe a cidade do recebedor.")


@app.get("/api/payment-settings/pix")
def get_pix_settings(db: Session = Depends(get_db)) -> dict:
    record = db.scalar(select(PaymentSettings).where(PaymentSettings.company_key == current_tenant()))
    return {"settings": pix_settings_json(record)}


@app.put("/api/payment-settings/pix")
def update_pix_settings(payload: PixPaymentSettingsInput, db: Session = Depends(get_db)) -> dict:
    validate_pix_settings(payload)
    with db.begin():
        settings_record = db.scalar(select(PaymentSettings).where(PaymentSettings.company_key == current_tenant()))
        if not settings_record:
            settings_record = PaymentSettings()
            db.add(settings_record)
        settings_record.pix_enabled = payload.enabled
        settings_record.pix_key_type = payload.keyType
        settings_record.pix_key = payload.key
        settings_record.pix_receiver_name = payload.receiverName
        settings_record.pix_city = payload.city
        db.flush()
    return {"settings": pix_settings_json(settings_record)}


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
    if payload.supplierId is None:
        raise HTTPException(422, "Selecione um fornecedor.")
    if payload.currentStock <= 0:
        raise HTTPException(422, "Informe um estoque inicial maior que zero.")
    validate_supplier(db, payload.supplierId)
    try:
        company_key = current_tenant()
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": f"product-sequence:{company_key}"},
        )
        existing_skus = db.scalars(select(Product.sku)).all()
        sequence_value = max(
            (int("".join(character for character in sku if character.isdigit()) or "0") for sku in existing_skus),
            default=0,
        ) + 1
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
    if payload.supplierId is None:
        raise HTTPException(422, "Selecione um fornecedor.")
    validate_supplier(db, payload.supplierId)
    product = find_product(db, product_id, lock=True)
    sale_price_changed = Decimal(product.sale_price) != payload.salePrice
    previous_stock = Decimal(product.current_stock)
    stock_changed = previous_stock != payload.currentStock
    product.name = payload.name.strip()
    product.barcode = payload.barcode
    product.category = payload.category.strip() or "Mercearia"
    product.unit = payload.unit
    product.cost_price = payload.costPrice
    product.sale_price = payload.salePrice
    product.current_stock = payload.currentStock
    product.minimum_stock = payload.minimumStock
    product.supplier_id = payload.supplierId
    if stock_changed:
        db.add(
            StockMovement(
                product_id=product.id,
                type="ajuste",
                quantity=abs(payload.currentStock - previous_stock),
                previous_stock=previous_stock,
                resulting_stock=payload.currentStock,
                unit_cost=payload.costPrice,
                reason="Ajuste pela edição do produto",
                notes="Saldo alterado no cadastro do produto.",
            )
        )
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
    closures = db.scalars(
        select(CashClosure)
        .order_by(CashClosure.created_at.desc(), CashClosure.id.desc())
        .limit(500)
    ).all()
    combined = [movement_json(movement) for movement in movements]
    combined.extend(cash_closure_json(closure, as_movement=True) for closure in closures)
    combined.sort(key=lambda item: item["createdAt"], reverse=True)
    return {"movements": combined}


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


def find_open_cash_register(
    db: Session, operator_email: str, *, lock: bool = False
) -> CashRegister | None:
    statement = (
        select(CashRegister)
        .where(
            func.lower(CashRegister.operator_email) == operator_email,
            CashRegister.status == "open",
        )
        .order_by(CashRegister.opened_at.desc(), CashRegister.id.desc())
        .limit(1)
    )
    if lock:
        statement = statement.with_for_update()
    return db.scalar(statement)


def cash_register_json(register: CashRegister) -> dict:
    return {
        "id": register.id,
        "operatorName": register.operator_name,
        "operatorEmail": register.operator_email,
        "status": register.status,
        "openedAt": register.opened_at.isoformat(),
        "closedAt": register.closed_at.isoformat() if register.closed_at else None,
        "closureId": register.closure_id,
    }


@app.get("/api/cash-registers/status")
def cash_register_status(operatorEmail: str, db: Session = Depends(get_db)) -> dict:
    register = find_open_cash_register(db, operatorEmail.strip().lower())
    return {
        "isOpen": register is not None,
        "register": cash_register_json(register) if register else None,
    }


@app.post("/api/cash-registers/open", status_code=201)
def open_cash_register(payload: CashRegisterOpenInput, db: Session = Depends(get_db)) -> dict:
    operator_email = payload.operatorEmail.strip().lower()
    with db.begin():
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": f"cash-register:{operator_email}"},
        )
        if find_open_cash_register(db, operator_email, lock=True):
            raise HTTPException(409, "Este operador já possui um caixa aberto.")
        register = CashRegister(
            operator_name=payload.operatorName.strip(),
            operator_email=operator_email,
            status="open",
        )
        db.add(register)
        db.flush()
    return {"register": cash_register_json(register)}


@app.post("/api/sales", status_code=201)
def create_sale(payload: SaleInput, db: Session = Depends(get_db)) -> dict:
    requested: dict[int, Decimal] = defaultdict(Decimal)
    for line in payload.items:
        requested[line.productId] += line.quantity

    with db.begin():
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": f"cash-register:{payload.operatorEmail.strip().lower()}"},
        )
        if not find_open_cash_register(db, payload.operatorEmail.strip().lower(), lock=True):
            raise HTTPException(409, "O caixa está fechado. Abra um novo caixa antes de realizar vendas.")
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
        "sale": sale_json(sale)
    }


def sale_json(sale: Sale) -> dict:
    return {
        "id": sale.id,
        "status": sale.status,
        "paymentMethod": sale.payment_method,
        "total": number(sale.total),
        "operatorName": sale.operator_name,
        "operatorEmail": sale.operator_email,
        "createdAt": sale.created_at.isoformat(),
        "cancelledAt": sale.cancelled_at.isoformat() if sale.cancelled_at else None,
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


def cash_period(
    db: Session, operator_email: str, period_start: datetime, period_end: datetime
) -> tuple[Decimal, int, int]:
    system_total, cash_sale_count = db.execute(
        select(func.coalesce(func.sum(Sale.total), 0), func.count(Sale.id)).where(
            Sale.status == "completed",
            Sale.payment_method == "dinheiro",
            func.lower(Sale.operator_email) == operator_email,
            Sale.created_at >= period_start,
            Sale.created_at <= period_end,
        )
    ).one()
    total_sale_count = db.scalar(
        select(func.count(Sale.id)).where(
            Sale.status == "completed",
            func.lower(Sale.operator_email) == operator_email,
            Sale.created_at >= period_start,
            Sale.created_at <= period_end,
        )
    )
    return (
        Decimal(system_total).quantize(CENT),
        int(cash_sale_count),
        int(total_sale_count or 0),
    )


def cash_closure_json(closure: CashClosure, as_movement: bool = False) -> dict:
    result = {
        "id": closure.id,
        "operatorName": closure.operator_name,
        "operatorEmail": closure.operator_email,
        "periodStart": closure.period_start.isoformat(),
        "periodEnd": closure.period_end.isoformat(),
        "systemCashTotal": number(closure.system_cash_total),
        "declaredCashTotal": number(closure.declared_cash_total),
        "difference": number(closure.difference),
        "cashSalesCount": closure.cash_sales_count,
        "totalSalesCount": closure.total_sales_count,
        "createdAt": closure.created_at.isoformat(),
    }
    if as_movement:
        result.update(
            {
                "id": f"closure-{closure.id}",
                "productId": 0,
                "productName": "Fechamento de caixa",
                "sku": "",
                "unit": "",
                "type": "fechamento",
                "quantity": 0,
                "previousStock": 0,
                "resultingStock": 0,
                "unitCost": 0,
                "reason": f"Fechamento #{closure.id}",
                "notes": (
                    f"Sistema: R$ {closure.system_cash_total:.2f} · "
                    f"Declarado: R$ {closure.declared_cash_total:.2f} · "
                    f"Diferença: R$ {closure.difference:.2f}"
                ),
                "closureId": closure.id,
                "saleId": None,
            }
        )
    return result


@app.get("/api/cash-closures/preview")
def preview_cash_closure(operatorEmail: str, db: Session = Depends(get_db)) -> dict:
    operator_email = operatorEmail.strip().lower()
    register = find_open_cash_register(db, operator_email)
    if not register:
        raise HTTPException(409, "O caixa já está fechado.")
    period_end = datetime.now(timezone.utc)
    return {
        "preview": {
            "periodStart": register.opened_at.isoformat(),
            "periodEnd": period_end.isoformat(),
        }
    }


@app.post("/api/cash-closures", status_code=201)
def create_cash_closure(payload: CashClosureInput, db: Session = Depends(get_db)) -> dict:
    operator_email = payload.operatorEmail.strip().lower()
    with db.begin():
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": f"cash-register:{operator_email}"},
        )
        register = find_open_cash_register(db, operator_email, lock=True)
        if not register:
            raise HTTPException(409, "O caixa já está fechado. Abra um novo caixa para voltar a vender.")
        period_end = datetime.now(timezone.utc)
        period_start = register.opened_at
        system_total, cash_sale_count, total_sale_count = cash_period(
            db, operator_email, period_start, period_end
        )
        declared_total = payload.declaredCashTotal.quantize(CENT, rounding=ROUND_HALF_UP)
        closure = CashClosure(
            operator_name=payload.operatorName.strip(),
            operator_email=operator_email,
            period_start=period_start,
            period_end=period_end,
            system_cash_total=system_total,
            declared_cash_total=declared_total,
            difference=(declared_total - system_total).quantize(CENT),
            cash_sales_count=cash_sale_count,
            total_sales_count=total_sale_count,
        )
        db.add(closure)
        db.flush()
        register.status = "closed"
        register.closed_at = period_end
        register.closure_id = closure.id
    return {"closure": cash_closure_json(closure)}


@app.get("/api/sales/latest")
def latest_completed_sale(operatorEmail: str, db: Session = Depends(get_db)) -> dict:
    sale = db.scalar(
        select(Sale)
        .options(joinedload(Sale.items))
        .where(
            Sale.status == "completed",
            func.lower(Sale.operator_email) == operatorEmail.strip().lower(),
        )
        .order_by(Sale.created_at.desc(), Sale.id.desc())
        .limit(1)
    )
    if not sale:
        raise HTTPException(404, "Nenhuma venda concluída deste operador para cancelar.")
    return {"sale": sale_json(sale)}


@app.post("/api/sales/{sale_id}/cancel")
def cancel_sale(sale_id: int, payload: CancelSaleInput, db: Session = Depends(get_db)) -> dict:
    with db.begin():
        sale = db.scalar(select(Sale).where(Sale.id == sale_id).with_for_update())
        if not sale:
            raise HTTPException(404, "Venda não encontrada.")
        if sale.status != "completed":
            raise HTTPException(409, "Esta venda já foi cancelada.")
        if sale.operator_email.lower() != payload.operatorEmail.strip().lower():
            raise HTTPException(403, "Somente o operador que realizou a venda pode cancelá-la.")

        items = db.scalars(
            select(SaleItem).where(SaleItem.sale_id == sale.id).order_by(SaleItem.product_id)
        ).all()
        product_ids = sorted({item.product_id for item in items if item.product_id is not None})
        products = db.scalars(
            select(Product).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()
        ).all()
        by_id = {product.id: product for product in products}
        missing_items = [item.product_name for item in items if item.product_id not in by_id]
        if missing_items:
            raise HTTPException(
                409,
                f"Não é possível devolver ao estoque porque o produto {missing_items[0]} foi excluído.",
            )

        for item in items:
            product = by_id[item.product_id]
            previous = Decimal(product.current_stock)
            resulting = previous + item.quantity
            product.current_stock = resulting
            db.add(
                StockMovement(
                    product_id=product.id,
                    sale_id=sale.id,
                    type="entrada",
                    quantity=item.quantity,
                    previous_stock=previous,
                    resulting_stock=resulting,
                    unit_cost=product.cost_price,
                    reason=f"Cancelamento da venda #{sale.id}",
                    notes=f"Estorno: R$ {sale.total:.2f} · Itens devolvidos ao estoque",
                    operator_name=payload.operatorName.strip(),
                )
            )

        sale.status = "cancelled"
        sale.cancelled_at = datetime.now(timezone.utc)
        sale.cancelled_by_name = payload.operatorName.strip()
        sale.cancelled_by_email = payload.operatorEmail.strip().lower()

    sale = db.scalar(select(Sale).options(joinedload(Sale.items)).where(Sale.id == sale_id))
    return {"sale": sale_json(sale), "restoredItems": len(items)}


@app.get("/api/sales")
def list_sales(db: Session = Depends(get_db)) -> dict:
    sales = db.scalars(
        select(Sale).options(joinedload(Sale.items)).order_by(Sale.created_at.desc(), Sale.id.desc()).limit(200)
    ).unique().all()
    return {
        "sales": [
            {**sale_json(sale), "itemCount": sum(number(item.quantity) for item in sale.items)}
            for sale in sales
        ]
    }
