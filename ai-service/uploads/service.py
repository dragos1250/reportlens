"""What the API does with uploads: accept a file, report a job, delete a document."""

from collections.abc import Callable

from . import jobs
from .checks import UploadRejected, check_header, check_size, safe_title
from .limits import UploadLimits
from .run_job import files_of


class TooManyUploads(Exception):
    pass


class Uploads:
    def __init__(self, conn: Callable, limits: UploadLimits, on_change: Callable[[], None] = lambda: None):
        self.conn = conn  # returns the shared connection
        self.limits = limits
        self.on_change = on_change

    def submit(self, data: bytes, filename: str | None) -> dict:
        """Checks the file (real type, size), stores it under a random id, queues a job.
        Raises UploadRejected or TooManyUploads."""
        check_size(len(data), self.limits.max_bytes)
        check_header(data)
        conn = self.conn()
        if jobs.count_kept(conn) >= self.limits.max_documents:
            raise TooManyUploads(f"The server already keeps {self.limits.max_documents} uploaded reports. "
                                 "Try again later, after older ones expire.")
        job_id, doc_id = jobs.new_ids()
        path = jobs.pdf_path(doc_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        title = safe_title(filename)
        jobs.create(conn, job_id, doc_id, title)
        return {"job_id": job_id, "doc_id": doc_id, "title": title, "state": "queued"}

    def status(self, job_id: str) -> dict | None:
        return jobs.get(self.conn(), job_id)

    def delete(self, doc_id: str) -> bool:
        removed = jobs.delete_upload(self.conn(), doc_id, files_of(doc_id))
        if removed:
            self.on_change()
        return removed


__all__ = ["Uploads", "UploadRejected", "TooManyUploads"]
