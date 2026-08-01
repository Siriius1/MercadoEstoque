import os
from datetime import datetime

os.environ["DATABASE_URL"] = "postgresql+psycopg://postgres@127.0.0.1:5433/mercado_estoque_test"
os.environ["MERCADO_INTERNAL_API_KEY"] = "test-internal-api-key"

from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.database import Base, engine
from backend.app.main import app


def api_headers(company: str) -> dict[str, str]:
    return {
        "X-Mercado-Tenant": company,
        "X-Mercado-Internal-Key": "test-internal-api-key",
        "X-Mercado-User-Role": "admin",
    }


def reset_database() -> None:
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP SEQUENCE IF EXISTS product_sku_seq"))
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE SEQUENCE product_sku_seq START WITH 1"))


def create_supplier(client: TestClient) -> int:
    response = client.post(
        "/api/suppliers",
        json={"name": "Fornecedor de teste"},
    )
    assert response.status_code == 201
    return response.json()["supplier"]["id"]


def test_cors_preflight_does_not_require_tenant_header() -> None:
    with TestClient(app) as client:
        response = client.options(
            "/api/cash-registers/open",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-mercado-tenant",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_api_rejects_requests_without_internal_key() -> None:
    with TestClient(app, headers={"X-Mercado-Tenant": "test-company"}) as client:
        response = client.get("/api/products")

    assert response.status_code == 401
    assert response.json()["detail"] == "Acesso interno não autorizado."


def test_cashier_cannot_access_administrative_api_routes() -> None:
    headers = api_headers("test-company")
    headers["X-Mercado-User-Role"] = "cashier"
    with TestClient(app, headers=headers) as client:
        allowed = client.get("/api/products")
        denied = client.get("/api/suppliers")

    assert allowed.status_code == 200
    assert denied.status_code == 403
    assert denied.json()["detail"] == "Seu perfil não possui permissão para esta operação."


def test_companies_have_independent_products_and_numbering() -> None:
    reset_database()
    with (
        TestClient(app, headers=api_headers("company-a")) as company_a,
        TestClient(app, headers=api_headers("company-b")) as company_b,
    ):
        supplier_a = create_supplier(company_a)
        first_a = company_a.post(
            "/api/products",
            json={
                "name": "Produto da empresa A",
                "costPrice": 5,
                "salePrice": 10,
                "currentStock": 8,
                "supplierId": supplier_a,
            },
        )
        assert first_a.status_code == 201
        assert first_a.json()["product"]["sku"] == "#0001"
        assert company_b.get("/api/products").json()["products"] == []

        supplier_b = create_supplier(company_b)
        first_b = company_b.post(
            "/api/products",
            json={
                "name": "Produto da empresa B",
                "costPrice": 3,
                "salePrice": 7,
                "currentStock": 4,
                "supplierId": supplier_b,
            },
        )
        assert first_b.status_code == 201
        assert first_b.json()["product"]["sku"] == "#0001"
        assert [item["name"] for item in company_a.get("/api/products").json()["products"]] == ["Produto da empresa A"]


def test_supplier_document_accepts_only_complete_cpf_or_cnpj() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        invalid = client.post(
            "/api/suppliers",
            json={"name": "Fornecedor inválido", "document": "12345678901abc"},
        )
        assert invalid.status_code == 422

        valid = client.post(
            "/api/suppliers",
            json={"name": "Fornecedor válido", "document": "12345678901"},
        )
        assert valid.status_code == 201
        assert valid.json()["supplier"]["document"] == "123.456.789-01"


def test_pix_settings_are_validated_and_persisted() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        default_settings = client.get("/api/payment-settings/pix").json()["settings"]
        assert default_settings["enabled"] is False

        invalid = client.put(
            "/api/payment-settings/pix",
            json={
                "enabled": True,
                "keyType": "cnpj",
                "key": "123",
                "receiverName": "Mercado Teste",
                "city": "São Paulo",
            },
        )
        assert invalid.status_code == 400

        saved = client.put(
            "/api/payment-settings/pix",
            json={
                "enabled": True,
                "keyType": "cnpj",
                "key": "12.345.678/0001-99",
                "receiverName": "Mercado Teste",
                "city": "São Paulo",
            },
        )
        assert saved.status_code == 200
        assert saved.json()["settings"]["key"] == "12345678000199"
        assert client.get("/api/payment-settings/pix").json()["settings"]["receiverName"] == "Mercado Teste"


def open_cash_register(
    client: TestClient,
    operator_name: str = "Operador Teste",
    operator_email: str = "operador@teste.com",
) -> dict:
    response = client.post(
        "/api/cash-registers/open",
        json={"operatorName": operator_name, "operatorEmail": operator_email},
    )
    assert response.status_code == 201
    return response.json()["register"]


def test_product_requires_supplier_prices_and_initial_stock() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        response = client.post(
            "/api/products",
            json={
                "name": "Produto incompleto",
                "costPrice": 0,
                "salePrice": 0,
                "currentStock": 0,
                "supplierId": "",
            },
        )
        assert response.status_code == 422


def test_names_cannot_contain_only_spaces() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        supplier = client.post("/api/suppliers", json={"name": "   "})
        assert supplier.status_code == 422


def test_stock_operations_accept_only_whole_units() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        supplier_id = create_supplier(client)
        product = client.post(
            "/api/products",
            json={
                "name": "Produto unitário",
                "costPrice": 2,
                "salePrice": 5,
                "currentStock": 10,
                "supplierId": supplier_id,
            },
        ).json()["product"]

        fractional_movement = client.post(
            "/api/movements",
            json={"productId": product["id"], "type": "entrada", "quantity": 0.5},
        )
        assert fractional_movement.status_code == 422

        open_cash_register(client)
        fractional_sale = client.post(
            "/api/sales",
            json={
                "items": [{"productId": product["id"], "quantity": 1.5}],
                "paymentMethod": "dinheiro",
                "operatorName": "Operador Teste",
                "operatorEmail": "operador@teste.com",
            },
        )
        assert fractional_sale.status_code == 422
        assert client.get("/api/products").json()["products"][0]["currentStock"] == 10


def test_deleting_supplier_also_deletes_linked_products() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        supplier_id = create_supplier(client)
        created = client.post(
            "/api/products",
            json={
                "name": "Produto vinculado",
                "costPrice": 2,
                "salePrice": 5,
                "currentStock": 10,
                "supplierId": supplier_id,
            },
        )
        assert created.status_code == 201

        deleted = client.delete(f"/api/suppliers/{supplier_id}")
        assert deleted.status_code == 200
        assert deleted.json()["deletedProducts"] == 1
        assert client.get("/api/products").json()["products"] == []
        assert client.get("/api/suppliers").json()["suppliers"] == []


def test_sale_is_atomic_and_updates_stock_and_movements() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        supplier_id = create_supplier(client)
        product_response = client.post(
            "/api/products",
            json={
                "name": "Produto de teste",
                "barcode": "789000000001",
                "category": "Teste",
                "unit": "un",
                "costPrice": 4.5,
                "salePrice": 10,
                "currentStock": 3,
                "supplierId": supplier_id,
            },
        )
        assert product_response.status_code == 201
        product_id = product_response.json()["product"]["id"]
        assert product_response.json()["product"]["minimumStock"] == 5
        open_cash_register(client)

        sale_response = client.post(
            "/api/sales",
            json={
                "items": [{"productId": product_id, "quantity": 2}],
                "paymentMethod": "pix",
                "operatorName": "Operador Teste",
                "operatorEmail": "operador@teste.com",
            },
        )
        assert sale_response.status_code == 201
        sale = sale_response.json()["sale"]
        assert sale["total"] == 20
        assert sale["items"][0]["productName"] == "Produto de teste"
        assert sale["items"][0]["unitPrice"] == 10

        product = client.get("/api/products").json()["products"][0]
        assert product["currentStock"] == 1
        movement = client.get("/api/movements").json()["movements"][0]
        assert movement["saleId"] == sale["id"]
        assert movement["previousStock"] == 3
        assert movement["resultingStock"] == 1

        failed_response = client.post(
            "/api/sales",
            json={
                "items": [{"productId": product_id, "quantity": 2}],
                "paymentMethod": "dinheiro",
                "operatorName": "Operador Teste",
                "operatorEmail": "operador@teste.com",
            },
        )
        assert failed_response.status_code == 409
        assert client.get("/api/products").json()["products"][0]["currentStock"] == 1
        assert len(client.get("/api/sales").json()["sales"]) == 1

        cancellation = client.post(
            f"/api/sales/{sale['id']}/cancel",
            json={
                "operatorName": "Operador Teste",
                "operatorEmail": "operador@teste.com",
            },
        )
        assert cancellation.status_code == 200
        cancelled_sale = cancellation.json()["sale"]
        assert cancelled_sale["status"] == "cancelled"
        assert cancelled_sale["total"] == 20
        assert client.get("/api/products").json()["products"][0]["currentStock"] == 3
        movements = client.get("/api/movements").json()["movements"]
        assert movements[0]["reason"] == f"Cancelamento da venda #{sale['id']}"
        assert movements[0]["previousStock"] == 1
        assert movements[0]["resultingStock"] == 3
        assert (
            client.get(
                "/api/sales/latest",
                params={"operatorEmail": "operador@teste.com"},
            ).status_code
            == 404
        )

        update_response = client.put(
            f"/api/products/{product_id}",
            json={
                "name": "Produto de teste",
                "barcode": "789000000001",
                "category": "Teste",
                "unit": "un",
                "costPrice": 4.5,
                "salePrice": 10,
                "currentStock": 8,
                "supplierId": supplier_id,
            },
        )
        assert update_response.status_code == 200
        assert update_response.json()["product"]["currentStock"] == 8
        adjustment = client.get("/api/movements").json()["movements"][0]
        assert adjustment["type"] == "ajuste"
        assert adjustment["previousStock"] == 3
        assert adjustment["resultingStock"] == 8
        assert adjustment["reason"] == "Ajuste pela edição do produto"

        fractional_update = client.put(
            f"/api/products/{product_id}",
            json={
                "name": "Produto de teste",
                "barcode": "789000000001",
                "category": "Teste",
                "unit": "un",
                "costPrice": 4.5,
                "salePrice": 10,
                "currentStock": 8.5,
                "supplierId": supplier_id,
            },
        )
        assert fractional_update.status_code == 422


def test_one_insufficient_item_rolls_back_every_item() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        supplier_id = create_supplier(client)
        first = client.post(
            "/api/products",
            json={
                "name": "Produto com saldo",
                "costPrice": 2,
                "salePrice": 5,
                "currentStock": 5,
                "minimumStock": 1,
                "supplierId": supplier_id,
            },
        ).json()["product"]
        second = client.post(
            "/api/products",
            json={
                "name": "Produto sem saldo suficiente",
                "costPrice": 3,
                "salePrice": 7,
                "currentStock": 1,
                "minimumStock": 1,
                "supplierId": supplier_id,
            },
        ).json()["product"]
        open_cash_register(client)

        response = client.post(
            "/api/sales",
            json={
                "items": [
                    {"productId": first["id"], "quantity": 2},
                    {"productId": second["id"], "quantity": 2},
                ],
                "paymentMethod": "cartao",
                "operatorName": "Operador Teste",
                "operatorEmail": "operador@teste.com",
            },
        )

        assert response.status_code == 409
        products = {product["id"]: product for product in client.get("/api/products").json()["products"]}
        assert products[first["id"]]["currentStock"] == 5
        assert products[second["id"]]["currentStock"] == 1
        assert client.get("/api/sales").json()["sales"] == []


def test_cash_closure_compares_only_cash_sales_since_last_closure() -> None:
    reset_database()
    with TestClient(app, headers=api_headers("test-company")) as client:
        supplier_id = create_supplier(client)
        product = client.post(
            "/api/products",
            json={
                "name": "Produto do caixa",
                "costPrice": 2,
                "salePrice": 5,
                "currentStock": 10,
                "minimumStock": 1,
                "supplierId": supplier_id,
            },
        ).json()["product"]
        operator = {
            "operatorName": "Operador Caixa",
            "operatorEmail": "caixa@teste.com",
        }
        first_register = open_cash_register(client, **{
            "operator_name": operator["operatorName"],
            "operator_email": operator["operatorEmail"],
        })
        assert first_register["status"] == "open"
        for payment_method in ("dinheiro", "pix"):
            response = client.post(
                "/api/sales",
                json={
                    "items": [{"productId": product["id"], "quantity": 2}],
                    "paymentMethod": payment_method,
                    **operator,
                },
            )
            assert response.status_code == 201

        preview = client.get(
            "/api/cash-closures/preview",
            params={"operatorEmail": operator["operatorEmail"]},
        ).json()["preview"]
        assert "systemCashTotal" not in preview
        assert "cashSalesCount" not in preview

        closure_response = client.post(
            "/api/cash-closures",
            json={**operator, "declaredCashTotal": 9},
        )
        assert closure_response.status_code == 201
        closure = closure_response.json()["closure"]
        assert closure["systemCashTotal"] == 10
        assert closure["declaredCashTotal"] == 9
        assert closure["difference"] == -1
        assert closure["cashSalesCount"] == 1
        assert closure["totalSalesCount"] == 2

        movement = client.get("/api/movements").json()["movements"][0]
        assert movement["type"] == "fechamento"
        assert movement["systemCashTotal"] == 10
        assert movement["declaredCashTotal"] == 9
        assert movement["difference"] == -1
        assert movement["totalSalesCount"] == 2

        closed_status = client.get(
            "/api/cash-registers/status",
            params={"operatorEmail": operator["operatorEmail"]},
        ).json()
        assert closed_status["isOpen"] is False

        next_preview = client.get(
            "/api/cash-closures/preview",
            params={"operatorEmail": operator["operatorEmail"]},
        )
        assert next_preview.status_code == 409

        blocked_sale = client.post(
            "/api/sales",
            json={
                "items": [{"productId": product["id"], "quantity": 1}],
                "paymentMethod": "dinheiro",
                **operator,
            },
        )
        assert blocked_sale.status_code == 409

        second_register = open_cash_register(client, **{
            "operator_name": operator["operatorName"],
            "operator_email": operator["operatorEmail"],
        })
        assert datetime.fromisoformat(second_register["openedAt"]) >= datetime.fromisoformat(
            closure["periodEnd"]
        )
        sale_after_opening = client.post(
            "/api/sales",
            json={
                "items": [{"productId": product["id"], "quantity": 1}],
                "paymentMethod": "dinheiro",
                **operator,
            },
        )
        assert sale_after_opening.status_code == 201
        second_closure = client.post(
            "/api/cash-closures",
            json={**operator, "declaredCashTotal": 5},
        ).json()["closure"]
        assert second_closure["systemCashTotal"] == 5
        assert second_closure["cashSalesCount"] == 1
        assert second_closure["totalSalesCount"] == 1
        assert second_closure["difference"] == 0
