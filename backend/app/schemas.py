from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    barcode: str | None = Field(default=None, max_length=64)
    category: str = Field(default="Mercearia", max_length=100)
    unit: str = Field(default="un", max_length=12)
    costPrice: Decimal = Field(gt=0)
    salePrice: Decimal = Field(gt=0)
    currentStock: Decimal = Field(ge=0, multiple_of=1)
    minimumStock: Decimal = Field(default=5, ge=0)
    supplierId: int | None = None

    @field_validator("barcode", mode="before")
    @classmethod
    def empty_barcode_to_none(cls, value: object) -> object:
        return None if value in ("", None) else str(value).strip()

    @field_validator("supplierId", mode="before")
    @classmethod
    def empty_supplier_to_none(cls, value: object) -> object:
        return None if value in ("", None) else value


class SupplierInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    document: str = Field(default="", max_length=30)
    contact: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=180)
    phone: str = Field(default="", max_length=24)

    @field_validator("document", mode="before")
    @classmethod
    def format_document(cls, value: object) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        if any(not (character.isdigit() or character in ".-/ ") for character in text):
            raise ValueError("O CPF ou CNPJ não pode conter letras.")
        digits = "".join(character for character in text if character.isdigit())
        if len(digits) == 11:
            return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
        if len(digits) == 14:
            return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
        raise ValueError("Informe um CPF com 11 números ou um CNPJ com 14 números.")


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


class CashClosureInput(BaseModel):
    operatorName: str = Field(min_length=1, max_length=180)
    operatorEmail: str = Field(min_length=3, max_length=180)
    declaredCashTotal: Decimal = Field(ge=0)


class CashRegisterOpenInput(BaseModel):
    operatorName: str = Field(min_length=1, max_length=180)
    operatorEmail: str = Field(min_length=3, max_length=180)


class PixPaymentSettingsInput(BaseModel):
    enabled: bool = False
    keyType: Literal["cpf", "cnpj", "telefone", "email", "aleatoria"] = "cnpj"
    key: str = Field(default="", max_length=180)
    receiverName: str = Field(default="", max_length=25)
    city: str = Field(default="", max_length=15)

    @field_validator("key")
    @classmethod
    def normalize_key(cls, value: str, info) -> str:
        key_type = info.data.get("keyType", "cnpj")
        text = value.strip()
        if key_type in ("cpf", "cnpj"):
            return "".join(character for character in text if character.isdigit())
        if key_type == "email":
            return "".join(text.lower().split())
        if key_type == "telefone":
            digits = "".join(character for character in text if character.isdigit())
            return f"+{digits if digits.startswith('55') else f'55{digits}'}"
        return "".join(text.split())

    @field_validator("city", "receiverName")
    @classmethod
    def clean_owner_fields(cls, value: str) -> str:
        return value.strip()
