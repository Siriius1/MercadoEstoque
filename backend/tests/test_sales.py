import os

os.environ["DATABASE_URL"] = "postgresql+psycopg://postgres@127.0.0.1:5433/mercado_estoque_test"

from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.database import Base, engine
from backend.app.main import app


def reset_database() -> None:
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP SEQUENCE IF EXISTS product_sku_seq"))
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE SEQUENCE product_sku_seq START WITH 1"))


def test_sale_is_atomic_and_updates_stock_and_movements() -> None:
    reset_database()
    with TestClient(app) as client:
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
                "minimumStock": 1,
            },
        )
        assert product_response.status_code == 201
        product_id = product_response.json()["product"]["id"]

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


def test_one_insufficient_item_rolls_back_every_item() -> None:
    reset_database()
    with TestClient(app) as client:
        first = client.post(
            "/api/products",
            json={
                "name": "Produto com saldo",
                "salePrice": 5,
                "currentStock": 5,
                "minimumStock": 1,
            },
        ).json()["product"]
        second = client.post(
            "/api/products",
            json={
                "name": "Produto sem saldo suficiente",
                "salePrice": 7,
                "currentStock": 1,
                "minimumStock": 1,
            },
        ).json()["product"]

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
