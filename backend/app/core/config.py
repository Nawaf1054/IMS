"""Environment-driven configuration (pydantic-settings). Reads the repository-root .env."""

from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> repository root (one .env shared with docker-compose and Vite)
ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"

    # Database (Supabase Postgres; the local default is the Supabase CLI stack)
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"

    # Comma-separated list of allowed browser origins
    cors_origins: str = "http://localhost:5173"

    # Supabase Auth
    supabase_url: str = "http://127.0.0.1:54321"
    # Server-only key for the Auth admin API (creating and updating users).
    supabase_secret_key: str = ""
    # Only needed to verify HS256-signed tokens (legacy JWT secret, local CLI, tests).
    supabase_jwt_secret: str = ""

    # Business defaults
    default_tax_rate: Decimal = Decimal("0")
    default_currency: str = "SAR"

    # AI assistant
    llm_api_key: str = ""
    llm_model: str = ""
    ai_rate_limit_per_hour: int = 20

    # Seed admin
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = ""
    seed_admin_name: str = "Admin"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def supabase_auth_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
