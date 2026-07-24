from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    barcode: str | None = Field(default=None, max_length=64)
    category: str = Field(default="Mercearia", max_length=100)
    unit: str = Field(default="un", max_length=12)
    costPrice: Decimal = Field(default=0, ge=0)
    salePrice: Decimal = Field(default=0, ge=0)
    currentStock: Decimal = Field(default=0, ge=0)
    minimumStock: Decimal = Field(default=0, ge=0)
    supplierId: int | None = None

    @field_validator("barcode", mode="before")
    @classmethod
    def empty_barcode_to_none(cls, value: object) -> object:
        return None if value in ("", None) else str(value).strip()


class SupplierInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    document: str = Field(default="", max_length=30)
    contact: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=180)
    phone: str = Field(default="", max_length=24)


class MovementInput(BaseModel):
    productId: int
    type: Literal["entrada", "saida", "ajuste"]
    quantity: Decimal = Field(ge=0)
    unitCost: Decimal = Field(default=0, ge=0)
    reason: str = Field(default="", max_length=240)
    notes: str = ""
    operatorName: str = ""


class SaleLineInput(BaseModel):
    productId: int
    quantity: Decimal = Field(gt=0)


class SaleInput(BaseModel):
    items: list[SaleLineInput] = Field(min_length=1)
    paymentMethod: Literal["dinheiro", "cartao", "pix"]
    operatorName: str = Field(min_length=1, max_length=180)
    operatorEmail: str = Field(min_length=3, max_length=180)


class CancelSaleInput(BaseModel):
    operatorName: str = Field(min_length=1, max_length=180)
    operatorEmail: str = Field(min_length=3, max_length=180)
