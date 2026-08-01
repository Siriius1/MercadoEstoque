from backend.app.config import Settings


def test_provider_postgresql_url_uses_installed_psycopg_driver():
    settings = Settings(database_url="postgresql://usuario:senha@host/banco?sslmode=require")
    assert settings.database_url == "postgresql+psycopg://usuario:senha@host/banco?sslmode=require"


def test_explicit_sqlalchemy_driver_is_preserved():
    url = "postgresql+psycopg://usuario:senha@host/banco"
    assert Settings(database_url=url).database_url == url
