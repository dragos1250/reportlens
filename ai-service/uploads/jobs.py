"""Ingestion jobs in PostgreSQL (rag.ingest_jobs), so the state survives a restart."""

import re
import secrets
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = REPO_ROOT / "data" / "uploads"
ACTIVE = ("queued", "reading", "indexing")
MAX_ATTEMPTS = 2  # the first run and one automatic retry after an interruption
INTERRUPTED = "Processing was interrupted (the server restarted). Upload the file again."

COLUMNS = "id, doc_id, title, state, step, done, total, error, attempts"
UPLOAD_ID = re.compile(r"upload-[0-9a-f]{32}")  # exactly what new_ids() makes


def new_ids() -> tuple[str, str]:
    """(job id, document id). The document id is the only key to an unlisted upload, so it
    is random and long: 128 bits."""
    return secrets.token_hex(16), "upload-" + secrets.token_hex(16)


def pdf_path(doc_id: str, upload_dir: Path = UPLOAD_DIR) -> Path:
    """Inside the upload folder only; doc_id comes from new_ids, never from a file name, and
    anything else is refused outright rather than resolved."""
    if not UPLOAD_ID.fullmatch(doc_id):
        raise ValueError("unsafe document id")
    return upload_dir.resolve() / f"{doc_id}.pdf"


def _row(row) -> dict | None:
    return dict(zip(COLUMNS.split(", "), row)) if row else None


def create(conn, job_id: str, doc_id: str, title: str) -> None:
    conn.execute("INSERT INTO rag.ingest_jobs (id, doc_id, title, state) VALUES (%s, %s, %s, 'queued')",
                 (job_id, doc_id, title))


def get(conn, job_id: str) -> dict | None:
    job = _row(conn.execute(f"SELECT {COLUMNS} FROM rag.ingest_jobs WHERE id = %s", (job_id,)).fetchone())
    if job and job["state"] == "queued":
        job["queue_position"] = conn.execute(
            "SELECT count(*) FROM rag.ingest_jobs WHERE state IN ('queued', 'reading', 'indexing') "
            "AND created_at < (SELECT created_at FROM rag.ingest_jobs WHERE id = %s)", (job_id,)).fetchone()[0]
    return job


def update(conn, job_id: str, state: str, step: str, done: int, total: int) -> None:
    conn.execute("UPDATE rag.ingest_jobs SET state = %s, step = %s, done = %s, total = %s, updated_at = now() "
                 "WHERE id = %s", (state, step, done, total, job_id))


def finish(conn, job_id: str) -> None:
    conn.execute("UPDATE rag.ingest_jobs SET state = 'ready', step = NULL, error = NULL, updated_at = now() "
                 "WHERE id = %s", (job_id,))


def fail(conn, job_id: str, error: str) -> None:
    conn.execute("UPDATE rag.ingest_jobs SET state = 'failed', error = %s, updated_at = now() WHERE id = %s",
                 (error, job_id))


def claim_next(conn) -> dict | None:
    """The oldest queued job, now marked as started. SKIP LOCKED: two workers never take the same one."""
    return _row(conn.execute(
        f"""UPDATE rag.ingest_jobs SET state = 'reading', step = 'Checking the file', attempts = attempts + 1,
                   updated_at = now()
            WHERE id = (SELECT id FROM rag.ingest_jobs WHERE state = 'queued' ORDER BY created_at
                        LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING {COLUMNS}""").fetchone())


def recover_interrupted(conn) -> tuple[int, int]:
    """After a restart: a job that was running starts again once, then fails. Returns (requeued, failed)."""
    requeued = conn.execute("UPDATE rag.ingest_jobs SET state = 'queued', done = 0, total = 0, updated_at = now() "
                            "WHERE state IN ('reading', 'indexing') AND attempts < %s", (MAX_ATTEMPTS,)).rowcount
    failed = conn.execute("UPDATE rag.ingest_jobs SET state = 'failed', error = %s, updated_at = now() "
                          "WHERE state IN ('reading', 'indexing') AND attempts >= %s",
                          (INTERRUPTED, MAX_ATTEMPTS)).rowcount
    return requeued, failed


def count_kept(conn) -> int:
    """Uploads that count against the limit: ready documents and jobs still in progress."""
    return conn.execute(
        "SELECT (SELECT count(*) FROM rag.documents WHERE source = 'upload') + "
        "(SELECT count(*) FROM rag.ingest_jobs WHERE state IN ('queued', 'reading', 'indexing'))").fetchone()[0]


def expired(conn) -> list[str]:
    """Uploaded documents past their expiry, and failed jobs older than a day."""
    rows = conn.execute(
        "SELECT doc_id FROM rag.documents WHERE source = 'upload' AND expires_at < now() "
        "UNION SELECT doc_id FROM rag.ingest_jobs WHERE state = 'failed' AND updated_at < now() - interval '1 day'"
    ).fetchall()
    return [r[0] for r in rows]


def delete_upload(conn, doc_id: str, files: list[Path]) -> bool:
    """Remove an uploaded document everywhere (rows cascade to chunks and vectors) and its
    files. Built-in reports are never deleted. Returns False if there was nothing to delete."""
    with conn.transaction():
        documents = conn.execute("DELETE FROM rag.documents WHERE doc_id = %s AND source = 'upload'",
                                 (doc_id,)).rowcount
        jobs = conn.execute("DELETE FROM rag.ingest_jobs WHERE doc_id = %s", (doc_id,)).rowcount
    for path in files:
        path.unlink(missing_ok=True)
    return bool(documents or jobs)
