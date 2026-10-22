"""Background worker: one ingestion at a time, in a separate process, with a time limit.

One at a time on purpose: embedding is CPU-bound, so two jobs in parallel would each take
about twice as long, and answers would slow down even more. Waiting jobs see their place
in the queue.
"""

import subprocess
import sys
import threading
import time
from collections.abc import Callable

from . import jobs
from .limits import UploadLimits
from .run_job import files_of

TIMED_OUT = "Processing took longer than {minutes} minutes and was stopped. Try a smaller PDF."
CRASHED = "The file could not be processed. Try another PDF."
CLEANUP_EVERY_SECONDS = 300


def run_one(conn, job: dict, limits: UploadLimits, run: Callable = subprocess.run) -> str:
    """Run one claimed job in a child process; returns the job's final state."""
    try:
        run([sys.executable, "-m", "uploads.run_job", job["id"]], timeout=limits.timeout_seconds, check=False)
    except subprocess.TimeoutExpired:  # subprocess.run has already killed the child
        jobs.fail(conn, job["id"], TIMED_OUT.format(minutes=limits.timeout_seconds // 60))
    final = jobs.get(conn, job["id"])
    if final and final["state"] in jobs.ACTIVE:  # the child died without saying how it ended
        jobs.fail(conn, job["id"], CRASHED)
        final["state"] = "failed"
    if final and final["state"] == "failed":
        for path in files_of(job["doc_id"]):
            path.unlink(missing_ok=True)
    return final["state"] if final else "failed"


def delete_expired(conn) -> list[str]:
    removed = [doc_id for doc_id in jobs.expired(conn) if jobs.delete_upload(conn, doc_id, files_of(doc_id))]
    return removed


class Worker(threading.Thread):
    """on_change() is called when the set of documents changes (an upload is ready or removed)."""

    def __init__(self, connect: Callable, on_change: Callable[[], None], limits: UploadLimits,
                 idle_seconds: float = 1.0):
        super().__init__(name="ingest-worker", daemon=True)
        self.connect = connect
        self.on_change = on_change
        self.limits = limits
        self.idle_seconds = idle_seconds
        self.stopping = threading.Event()

    def run(self) -> None:
        conn = self.connect()
        jobs.recover_interrupted(conn)
        last_cleanup = 0.0
        while not self.stopping.is_set():
            if time.monotonic() - last_cleanup >= CLEANUP_EVERY_SECONDS:
                if delete_expired(conn):
                    self.on_change()
                last_cleanup = time.monotonic()
            job = jobs.claim_next(conn)
            if job is None:
                self.stopping.wait(self.idle_seconds)
                continue
            if run_one(conn, job, self.limits) == "ready":
                self.on_change()
