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
    minimum_stock: Mapped[Decimal] = mapped_column(quantity_type, default=0)
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
