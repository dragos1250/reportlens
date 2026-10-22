"""Ingest one queued upload, in its own process (started by the worker).

The PDF is hostile input: the parser runs here, not in the API process, so a file that
hangs the parser is stopped by the worker's time limit without taking the API down.

No per-process memory limit: an address-space limit (RLIMIT_AS, 2 GB) made loading the
embedding model hang in the Docker image (no output in 120 s, against 6.6 s without it),
so it was removed; see ai-service/NOTES.md.

Usage: python -m uploads.run_job <job_id>
"""

import sys
import time
from datetime import datetime, timedelta, timezone

from retrieval.embedder import DEFAULT_MODEL, Embedder
from retrieval.index import index_paths
from storage.db import connect
from storage.load import load_document

from . import jobs
from .checks import UploadRejected
from .limits import UploadLimits
from .pipeline import ingest

FAILED = "The file could not be processed. Try another PDF."
PROGRESS_EVERY_SECONDS = 0.5


def files_of(doc_id: str) -> list:
    paths = index_paths(doc_id, DEFAULT_MODEL)
    return [jobs.pdf_path(doc_id), paths.chunks, paths.vectors, paths.meta]


def main(job_id: str) -> int:
    limits = UploadLimits.from_env()
    conn = connect()
    job = jobs.get(conn, job_id)
    if job is None:
        return 1

    last = 0.0

    def progress(state: str, step: str, done: int, total: int) -> None:
        nonlocal last
        now = time.monotonic()
        if now - last >= PROGRESS_EVERY_SECONDS or done == total:  # do not write on every page
            jobs.update(conn, job_id, state, step, done, total)
            last = now

    expires_at = datetime.now(timezone.utc) + timedelta(hours=limits.ttl_hours)

    def load(**fields) -> int:
        return load_document(conn, source="upload", expires_at=expires_at, **fields)

    try:
        # The model is created inside ingest, after the checks: never before the page count.
        ingest(job["doc_id"], job["title"], jobs.pdf_path(job["doc_id"]), limits, progress,
               lambda: Embedder(DEFAULT_MODEL), load)
    except UploadRejected as rejected:
        jobs.fail(conn, job_id, str(rejected))
        for path in files_of(job["doc_id"]):
            path.unlink(missing_ok=True)
        return 0
    except Exception as error:  # a parser or embedding failure; the details stay in the log
        print(f"job {job_id} failed: {type(error).__name__}", file=sys.stderr)
        jobs.fail(conn, job_id, FAILED)
        return 1
    jobs.finish(conn, job_id)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
