from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


money_type = Numeric(12, 2)
quantity_type = Numeric(14, 3)


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180))
    document: Mapped[str] = mapped_column(String(30), default="")
    contact: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(180), default="")
    phone: Mapped[str] = mapped_column(String(24), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    products: Mapped[list["Product"]] = relationship(back_populates="supplier", cascade="all, delete")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("current_stock >= 0", name="products_stock_nonnegative"),
        CheckConstraint("minimum_stock >= 0", name="products_minimum_nonnegative"),
        Index("products_name_idx", "name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    barcode: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    category: Mapped[str] = mapped_column(String(100), default="Mercearia")
    unit: Mapped[str] = mapped_column(String(12), default="un")
    cost_price: Mapped[Decimal] = mapped_column(money_type, default=0)
    sale_price: Mapped[Decimal] = mapped_column(money_type, default=0)
    sale_price_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    current_stock: Mapped[Decimal] = mapped_column(quantity_type, default=0)
    minimum_stock: Mapped[Decimal] = mapped_column(quantity_type, default=5, server_default="5")
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    supplier: Mapped[Supplier | None] = relationship(back_populates="products")
    movements: Mapped[list["StockMovement"]] = relationship(back_populates="product", cascade="all, delete")


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        CheckConstraint("status IN ('completed', 'cancelled')", name="sales_status_valid"),
        CheckConstraint("payment_method IN ('dinheiro', 'cartao', 'pix')", name="sales_payment_valid"),
        Index("sales_created_idx", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    payment_method: Mapped[str] = mapped_column(String(20))
    total: Mapped[Decimal] = mapped_column(money_type)
    operator_name: Mapped[str] = mapped_column(String(180))
    operator_email: Mapped[str] = mapped_column(String(180))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    cancelled_by_email: Mapped[str | None] = mapped_column(String(180), nullable=True)

    items: Mapped[list["SaleItem"]] = relationship(back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(180))
    product_sku: Mapped[str] = mapped_column(String(20))
    unit: Mapped[str] = mapped_column(String(12))
    quantity: Mapped[Decimal] = mapped_column(quantity_type)
    unit_price: Mapped[Decimal] = mapped_column(money_type)
    subtotal: Mapped[Decimal] = mapped_column(money_type)

    sale: Mapped[Sale] = relationship(back_populates="items")


class CashClosure(Base):
    __tablename__ = "cash_closures"
    __table_args__ = (
        Index("cash_closures_operator_period_idx", "operator_email", "period_end"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    operator_name: Mapped[str] = mapped_column(String(180))
    operator_email: Mapped[str] = mapped_column(String(180))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    system_cash_total: Mapped[Decimal] = mapped_column(money_type)
    declared_cash_total: Mapped[Decimal] = mapped_column(money_type)
    difference: Mapped[Decimal] = mapped_column(money_type)
    cash_sales_count: Mapped[int] = mapped_column(Integer, default=0)
    total_sales_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CashRegister(Base):
    __tablename__ = "cash_registers"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'closed')", name="cash_registers_status_valid"),
        Index("cash_registers_operator_status_idx", "operator_email", "status", "opened_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    operator_name: Mapped[str] = mapped_column(String(180))
    operator_email: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(20), default="open")
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closure_id: Mapped[int | None] = mapped_column(
        ForeignKey("cash_closures.id", ondelete="SET NULL"), nullable=True, unique=True
    )


class PaymentSettings(Base):
    __tablename__ = "payment_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    pix_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    pix_key_type: Mapped[str] = mapped_column(String(20), default="cnpj")
    pix_key: Mapped[str] = mapped_column(String(180), default="")
    pix_receiver_name: Mapped[str] = mapped_column(String(25), default="")
    pix_city: Mapped[str] = mapped_column(String(15), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint("type IN ('entrada', 'saida', 'ajuste')", name="movements_type_valid"),
        Index("movements_created_idx", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id", ondelete="SET NULL"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(20))
    quantity: Mapped[Decimal] = mapped_column(quantity_type)
    previous_stock: Mapped[Decimal] = mapped_column(quantity_type)
    resulting_stock: Mapped[Decimal] = mapped_column(quantity_type)
    unit_cost: Mapped[Decimal] = mapped_column(money_type, default=0)
    reason: Mapped[str] = mapped_column(String(240), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    operator_name: Mapped[str] = mapped_column(String(180), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped[Product] = relationship(back_populates="movements")
