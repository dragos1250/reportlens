"""Connection to PostgreSQL. Settings come from the environment (.env):
POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD.
The password is required and never printed.
"""

import os
from collections.abc import Mapping
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
SCHEMA_FILE = Path(__file__).with_name("schema.sql")


def conninfo(env: Mapping[str, str] | None = None) -> str:
    if env is None:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)  # does not override variables already set
        env = os.environ
    if not env.get("POSTGRES_PASSWORD"):
        raise ValueError("POSTGRES_PASSWORD is not set (see .env.example)")
    from psycopg.conninfo import make_conninfo
    return make_conninfo(
        # 127.0.0.1, not "localhost": on Windows "localhost" tries IPv6 (::1) first and the
        # database port is published on IPv4 only; that cost ~130 s per connection here.
        host=env.get("POSTGRES_HOST", "127.0.0.1"),
        port=env.get("POSTGRES_PORT", "5432"),
        dbname=env.get("POSTGRES_DB", "reportlens"),
        user=env.get("POSTGRES_USER", "reportlens"),
        password=env["POSTGRES_PASSWORD"],
        # Without it a closed port could hang for about two minutes on Windows before
        # failing; a missing database should be reported in seconds.
        connect_timeout=env.get("POSTGRES_CONNECT_TIMEOUT", "10"),
    )


def connect(env: Mapping[str, str] | None = None):
    """Autocommit connection with the pgvector type registered (numpy arrays <-> vector)."""
    import psycopg
    from pgvector.psycopg import register_vector

    conn = psycopg.connect(conninfo(env), autocommit=True)
    conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    register_vector(conn)
    return conn


def apply_schema(conn) -> None:
    conn.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
