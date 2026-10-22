"""CLI: prepare every report in scripts/reports.json, skipping the steps already done.

Usage (from ai-service/, database running), as the Docker "setup" service does:
    python -m storage.setup

For each report: download the PDF (official source, sha256 checked), split it into
chunks, embed them, load them into PostgreSQL. A step runs only when its result is
missing or out of date, so a second run finishes in seconds. Each step is the same
CLI the README uses by hand.
"""

import json
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from retrieval.embedder import DEFAULT_MODEL
from retrieval.index import file_sha256, index_paths, needs_build

from .db import apply_schema, connect

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "scripts" / "reports.json"
RAW_DIR = REPO_ROOT / "data" / "raw"
DOWNLOAD_SCRIPT = REPO_ROOT / "scripts" / "download_reports.py"


@dataclass(frozen=True)
class State:
    """What already exists for one report."""

    has_pdf: bool
    has_chunks: bool
    vectors_up_to_date: bool
    loaded_chunks_sha: str | None  # chunks_sha256 in rag.documents; None if not loaded
    chunks_sha: str | None  # sha256 of the chunks file on disk; None if missing


def steps_for(state: State) -> list[str]:
    """The steps one report still needs, in order. Redoing a step makes the next ones stale."""
    steps = []
    if not state.has_pdf:
        steps.append("download")
    if "download" in steps or not state.has_chunks:
        steps.append("ingest")
    if "ingest" in steps or not state.vectors_up_to_date:
        steps.append("embed")
    if "ingest" in steps or state.loaded_chunks_sha is None or state.loaded_chunks_sha != state.chunks_sha:
        steps.append("load")
    return steps


def commands(doc_id: str, step: str) -> list[str]:
    python = sys.executable
    return {
        "download": [python, str(DOWNLOAD_SCRIPT), doc_id],
        "ingest": [python, "-m", "ingestion.ingest", str(RAW_DIR / f"{doc_id}.pdf"), "--doc-id", doc_id],
        "embed": [python, "-m", "retrieval.build_index", "--doc-id", doc_id],
        "load": [python, "-m", "storage.load", "--doc-id", doc_id],
    }[step]


def current_state(doc_id: str, conn) -> State:
    paths = index_paths(doc_id, DEFAULT_MODEL)
    row = conn.execute("SELECT chunks_sha256 FROM rag.documents WHERE doc_id = %s", (doc_id,)).fetchone()
    return State(
        has_pdf=(RAW_DIR / f"{doc_id}.pdf").is_file(),
        has_chunks=paths.chunks.is_file(),
        vectors_up_to_date=paths.chunks.is_file() and not needs_build(paths, DEFAULT_MODEL),
        loaded_chunks_sha=row[0] if row else None,
        chunks_sha=file_sha256(paths.chunks) if paths.chunks.is_file() else None,
    )


def main() -> None:
    reports = json.loads(MANIFEST.read_text(encoding="utf-8"))
    conn = connect()
    apply_schema(conn)  # rag.documents must exist before the first state check
    for report in reports:
        doc_id = report["doc_id"]
        steps = steps_for(current_state(doc_id, conn))
        print(f"{doc_id}: {', '.join(steps) if steps else 'ready, nothing to do'}", flush=True)
        for step in steps:
            start = time.perf_counter()
            subprocess.run(commands(doc_id, step), check=True)
            print(f"{doc_id}: {step} done in {time.perf_counter() - start:.1f}s", flush=True)


if __name__ == "__main__":
    main()
