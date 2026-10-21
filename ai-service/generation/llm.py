"""Provider-independent interface to a language model.

The rest of the code only sees LLMClient.generate() and LLMResponse, so the
provider (or a local model) can change without touching prompts or citations.
Configuration comes from the environment (.env): LLM_PROVIDER, LLM_MODEL, LLM_API_KEY.
The API key is never printed: LLMConfig hides it from repr and error messages.
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
DEFAULT_REASONING_EFFORT = "low"


@dataclass(frozen=True)
class LLMResponse:
    text: str
    model: str
    input_tokens: int
    output_tokens: int  # includes reasoning tokens
    reasoning_tokens: int = 0
    cached_input_tokens: int = 0
    cache_write_tokens: int = 0
    incomplete_reason: str | None = None  # e.g. "max_output_tokens"; None if complete


class LLMClient(Protocol):
    model: str

    def generate(self, system: str, user: str, *, max_output_tokens: int,
                 json_schema: dict | None = None) -> LLMResponse: ...


def mask_secret(secret: str) -> str:
    return f"{secret[:3]}…****" if len(secret) > 8 else "****"


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    model: str
    api_key: str = field(repr=False)  # never in repr, logs or tracebacks of the config

    @property
    def masked_key(self) -> str:
        return mask_secret(self.api_key)


def config_from_env(env: Mapping[str, str] | None = None) -> LLMConfig:
    if env is None:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)  # does not override variables already set
        env = os.environ
    missing = [name for name in ("LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY") if not env.get(name)]
    if missing:
        raise ValueError(f"missing environment variables: {', '.join(missing)} (see .env.example)")
    return LLMConfig(provider=env["LLM_PROVIDER"], model=env["LLM_MODEL"], api_key=env["LLM_API_KEY"])


class OpenAIClient:
    """OpenAI Responses API. The only class that imports the openai package."""

    def __init__(self, model: str, api_key: str, reasoning_effort: str = DEFAULT_REASONING_EFFORT,
                 timeout: float = 60.0, client=None):
        """client can be injected (tests); otherwise the official SDK client is created."""
        if client is None:
            from openai import OpenAI
            client = OpenAI(api_key=api_key, timeout=timeout, max_retries=2)
        self.model = model
        self.reasoning_effort = reasoning_effort
        self._client = client

    def generate(self, system: str, user: str, *, max_output_tokens: int,
                 json_schema: dict | None = None) -> LLMResponse:
        request = {
            "model": self.model,
            "instructions": system,
            "input": user,
            "max_output_tokens": max_output_tokens,  # includes reasoning tokens
            "reasoning": {"effort": self.reasoning_effort},
            "store": False,  # do not keep the request and answer on OpenAI's side
        }
        if json_schema is not None:
            request["text"] = {"format": {
                "type": "json_schema", "name": "answer", "schema": json_schema, "strict": True,
            }}
        response = self._client.responses.create(**request)

        usage = response.usage
        incomplete = response.incomplete_details if response.status == "incomplete" else None
        return LLMResponse(
            text=response.output_text,
            model=self.model,  # the requested id, used for pricing
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            reasoning_tokens=usage.output_tokens_details.reasoning_tokens,
            cached_input_tokens=usage.input_tokens_details.cached_tokens,
            cache_write_tokens=getattr(usage.input_tokens_details, "cache_write_tokens", 0) or 0,
            incomplete_reason=incomplete.reason if incomplete else None,
        )


def client_from_config(config: LLMConfig, reasoning_effort: str = DEFAULT_REASONING_EFFORT) -> LLMClient:
    if config.provider == "openai":
        return OpenAIClient(config.model, config.api_key, reasoning_effort)
    raise ValueError(f"unknown LLM_PROVIDER {config.provider!r}; supported: openai")


def client_from_env(model: str | None = None,
                    reasoning_effort: str = DEFAULT_REASONING_EFFORT) -> LLMClient:
    """Client from .env; model overrides LLM_MODEL (e.g. to compare two models)."""
    config = config_from_env()
    if model:
        config = LLMConfig(config.provider, model, config.api_key)
    return client_from_config(config, reasoning_effort)
