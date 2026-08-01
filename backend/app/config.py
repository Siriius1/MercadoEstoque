from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres@127.0.0.1:5433/mercado_estoque"
    frontend_origin: str = "http://localhost:3000"
    google_client_id: str = ""
    mercado_internal_api_key: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Aceita URLs fornecidas por provedores e seleciona o driver psycopg 3 instalado."""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
