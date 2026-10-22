"""Jobs in a real PostgreSQL (skipped without one). Every test creates and removes its own rows."""

import subprocess

import pytest

from uploads import jobs
from uploads.limits import UploadLimits
from uploads.worker import CRASHED, run_one


@pytest.fixture
def conn():
    try:
        from storage.db import apply_schema, connect
        connection = connect()
    except Exception:
        pytest.skip("PostgreSQL not available on 127.0.0.1 (docker compose -f docker-compose.yml "
                    "-f docker-compose.dev.yml up -d db, POSTGRES_PASSWORD)")
    apply_schema(connection)
    if connection.execute("SELECT count(*) FROM rag.ingest_jobs WHERE state IN ('queued', 'reading', 'indexing')"
                          ).fetchone()[0]:
        pytest.skip("other uploads are in progress in this database")
    created: list[str] = []
    yield connection, created
    for doc_id in created:
        jobs.delete_upload(connection, doc_id, [])


def new_job(conn, created, title="r"):
    job_id, doc_id = jobs.new_ids()
    jobs.create(conn, job_id, doc_id, title)
    created.append(doc_id)
    return job_id, doc_id


def test_jobs_are_taken_oldest_first_and_waiting_ones_know_their_place(conn):
    c, created = conn
    first, _ = new_job(c, created)
    second, _ = new_job(c, created)
    assert jobs.get(c, second)["queue_position"] == 1
    claimed = jobs.claim_next(c)
    assert claimed["id"] == first and claimed["state"] == "reading" and claimed["attempts"] == 1
    jobs.update(c, first, "indexing", "Indexing", 64, 200)
    assert {k: jobs.get(c, first)[k] for k in ("state", "step", "done", "total")} == \
        {"state": "indexing", "step": "Indexing", "done": 64, "total": 200}
    assert jobs.get(c, second)["queue_position"] == 1  # the running job is still ahead of it


def test_an_interrupted_job_starts_again_once_then_fails(conn):
    c, created = conn
    job_id, _ = new_job(c, created)
    jobs.claim_next(c)
    jobs.recover_interrupted(c)  # as after a restart
    assert jobs.get(c, job_id)["state"] == "queued"
    jobs.claim_next(c)  # second attempt
    jobs.recover_interrupted(c)
    job = jobs.get(c, job_id)
    assert job["state"] == "failed" and job["error"] == jobs.INTERRUPTED


def test_a_child_that_times_out_or_dies_leaves_a_failed_job_with_a_message(conn):
    c, created = conn
    timed_out, _ = new_job(c, created)
    job = jobs.claim_next(c)

    def too_slow(*args, **kwargs):
        raise subprocess.TimeoutExpired(args[0], kwargs["timeout"])

    assert run_one(c, job, UploadLimits(timeout_seconds=600), run=too_slow) == "failed"
    assert jobs.get(c, timed_out)["error"].startswith("Processing took longer than 10 minutes")

    died, _ = new_job(c, created)
    job = jobs.claim_next(c)
    assert run_one(c, job, UploadLimits(), run=lambda *a, **k: None) == "failed"  # never reported an end
    assert jobs.get(c, died)["error"] == CRASHED


def test_uploads_in_progress_count_against_the_limit(conn):
    c, created = conn
    before = jobs.count_kept(c)
    new_job(c, created)
    assert jobs.count_kept(c) == before + 1


def test_deleting_removes_an_upload_and_its_files_but_never_a_builtin_report(conn, tmp_path):
    c, created = conn
    _, doc_id = new_job(c, created)
    c.execute("INSERT INTO rag.documents (doc_id, title, chunks_sha256, source, expires_at) "
              "VALUES (%s, 't', 'x', 'upload', now() - interval '1 hour')", (doc_id,))
    assert doc_id in jobs.expired(c)
    stored = tmp_path / f"{doc_id}.pdf"
    stored.write_bytes(b"%PDF-")
    assert jobs.delete_upload(c, doc_id, [stored]) is True
    assert not stored.exists() and jobs.get(c, jobs.new_ids()[0]) is None
    assert c.execute("SELECT count(*) FROM rag.documents WHERE doc_id = %s", (doc_id,)).fetchone()[0] == 0

    builtin = f"builtin-test-{doc_id[-6:]}"
    c.execute("INSERT INTO rag.documents (doc_id, title, chunks_sha256) VALUES (%s, 't', 'x')", (builtin,))
    try:
        assert jobs.delete_upload(c, builtin, []) is False
        assert c.execute("SELECT count(*) FROM rag.documents WHERE doc_id = %s", (builtin,)).fetchone()[0] == 1
    finally:
        c.execute("DELETE FROM rag.documents WHERE doc_id = %s", (builtin,))
