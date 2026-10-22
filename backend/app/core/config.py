"""Environment-driven configuration (pydantic-settings). Reads the repository-root .env."""

from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> repository root (one .env shared with docker-compose and Vite)
ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

# Gemini model used when LLM_MODEL is empty: Google's stable, low-cost fast model (has a free tier).
DEFAULT_LLM_MODEL = "gemini-3.5-flash-lite"


class Settings(BaseSettings):
    """Every setting the backend reads from the environment or the repository-root .env."""

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
    # The `iss` Supabase puts in tokens, if it differs from `<supabase_url>/auth/v1`. In docker-compose
    # the backend reaches Supabase at host.docker.internal while tokens say 127.0.0.1.
    supabase_jwt_issuer: str = ""

    # Business defaults
    default_tax_rate: Decimal = Decimal("0")
    default_currency: str = "SAR"
    # IANA zone that defines the business day for date filters ("today", "2026-10-19").
    business_timezone: str = "Asia/Riyadh"

    # AI assistant (Google Gemini). The key stays on the server (AI-6); empty means the AI endpoints
    # answer 503 AI_UNAVAILABLE while the rest of the app keeps working (AI-7).
    llm_api_key: str = ""
    llm_model: str = ""
    # Seconds to wait for one model response before giving up.
    llm_timeout_seconds: float = 30
    ai_rate_limit_per_hour: int = 20

    # Seed admin
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = ""
    seed_admin_name: str = "Admin"

    @field_validator("business_timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        """Rejects a BUSINESS_TIMEZONE that isn't a valid IANA zone name."""
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Unknown time zone: {value}") from exc
        return value

    @property
    def business_tz(self) -> ZoneInfo:
        """BUSINESS_TIMEZONE as a tzinfo object."""
        return ZoneInfo(self.business_timezone)

    @property
    def llm_model_name(self) -> str:
        """LLM_MODEL, or the default Gemini model when it's empty."""
        return self.llm_model.strip() or DEFAULT_LLM_MODEL

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS_ORIGINS split into a list of origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def supabase_auth_url(self) -> str:
        """Base URL of Supabase Auth, e.g. http://127.0.0.1:54321/auth/v1."""
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwt_issuer(self) -> str:
        """The `iss` value access tokens must carry."""
        return self.supabase_jwt_issuer.rstrip("/") or self.supabase_auth_url


@lru_cache
def get_settings() -> Settings:
    """The settings, read once and cached for the life of the process."""
    return Settings()
