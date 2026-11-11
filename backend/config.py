"""Central configuration. Every value comes from the environment / `.env`.

Secrets (passwords, keys) are only ever read here and are never logged or sent to the LLM.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore", case_sensitive=False)

    # --- PostgreSQL cluster that hosts the control plane AND the tenant databases ---
    pg_host: str = "localhost"
    pg_port: int = 5433
    pg_admin_user: str = "dbforge_admin"
    pg_admin_password: str = Field("", validation_alias=AliasChoices("NORMIE_ADMIN_PASSWORD", "DBFORGE_ADMIN_PASSWORD", "PG_ADMIN_PASSWORD"))
    control_db: str = "dbforge_control"

    # --- Secrets ---
    jwt_secret: str = Field(..., min_length=32)
    jwt_ttl_minutes: int = 60 * 12
    # Fernet key used to encrypt tenant DB passwords at rest in the control plane.
    credentials_key: str = Field(..., min_length=40)

    # --- LLM (any OpenAI-compatible endpoint: NVIDIA NIM, OpenAI, Ollama, vLLM ...) ---
    llm_base_url: str = Field(
        "https://integrate.api.nvidia.com/v1", validation_alias=AliasChoices("AGENT_BASE_URL", "BASE_URL", "base_url")
    )
    llm_api_key: str = Field("", validation_alias=AliasChoices("AGENT_API_KEY", "LLM_API_KEY", "api_key"))
    llm_model: str = Field(
        "nvidia/nemotron-3.5-lightning-30b-a3b", validation_alias=AliasChoices("AGENT_MODEL", "model")
    )
    llm_timeout_s: float = 120.0

    # --- Guardrails ---
    statement_timeout_ms: int = 5000
    row_limit: int = 1000
    agent_row_preview: int = 30  # rows the LLM is allowed to see per query
    max_dry_run_before_image: int = 500
    cookie_secure: bool = False  # set true behind HTTPS

    # Address shown to users on the Connect page for psql / GUI clients. Inside Docker the API reaches
    # PostgreSQL at an internal name ("db"); people outside need the server's public name instead.
    public_db_host: str = ""
    public_db_port: int = 0

    # If set, DATABASE_URL (a superuser on the cluster) wins over the PG_* fields above.
    # Its path names the control-plane database, e.g. postgresql://postgres:pw@localhost:5432/control
    database_url: str = ""

    def model_post_init(self, __context) -> None:
        if self.database_url:
            from urllib.parse import unquote, urlparse

            u = urlparse(self.database_url.replace("+asyncpg", ""))
            self.pg_host = u.hostname or self.pg_host
            self.pg_port = u.port or 5432
            self.pg_admin_user = unquote(u.username or self.pg_admin_user)
            self.pg_admin_password = unquote(u.password or "")
            if u.path.strip("/"):
                self.control_db = u.path.strip("/")

    @property
    def admin_dsn_params(self) -> dict:
        return dict(host=self.pg_host, port=self.pg_port, user=self.pg_admin_user, password=self.pg_admin_password)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
