"""Limits on uploaded PDFs, from the environment (see .env.example); the defaults are the
values chosen for stage 13."""

import os
from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class UploadLimits:
    max_bytes: int = 50 * 1024 * 1024  # the Vodafone 20-F is 32 MB
    max_pages: int = 600  # the Vodafone 20-F has 588
    min_text_share: float = 0.5  # below this share of pages with text: a scanned document, refused
    max_documents: int = 20  # uploaded documents kept at once (ready or in progress)
    ttl_hours: int = 24  # an upload is deleted this long after it is ready
    timeout_seconds: int = 600  # one ingestion; the two built-in reports take about 80 s each in Docker

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "UploadLimits":
        env = os.environ if env is None else env

        def number(name: str, default, kind=int):
            value = env.get(name, "").strip()
            return kind(value) if value else default

        d = cls()
        return cls(
            max_bytes=number("UPLOAD_MAX_MB", d.max_bytes // (1024 * 1024)) * 1024 * 1024,
            max_pages=number("UPLOAD_MAX_PAGES", d.max_pages),
            min_text_share=number("UPLOAD_MIN_TEXT_SHARE", d.min_text_share, float),
            max_documents=number("UPLOAD_MAX_DOCUMENTS", d.max_documents),
            ttl_hours=number("UPLOAD_TTL_HOURS", d.ttl_hours),
            timeout_seconds=number("UPLOAD_TIMEOUT_SECONDS", d.timeout_seconds),
        )
