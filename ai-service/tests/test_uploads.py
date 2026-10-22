import numpy as np
import pytest

from pdf_fixture import make_pdf
from retrieval.index import index_paths
from uploads.checks import (UploadRejected, check_header, check_pages, check_size, check_text_layer, count_pages,
                            safe_title)
from uploads.jobs import new_ids, pdf_path
from uploads.limits import UploadLimits
from uploads.pipeline import ingest


class FakeEmbedder:
    def __init__(self):
        self.calls = 0

    def embed_passages(self, texts):
        self.calls += 1
        return np.ones((len(texts), 4), dtype=np.float32)


def write_pdf(tmp_path, pages):
    path = tmp_path / "report.pdf"
    path.write_bytes(make_pdf(pages))
    return path


# --- checks on the file ---

def test_only_real_pdf_bytes_are_accepted_whatever_the_name():
    check_header(make_pdf(["Revenue"]))
    with pytest.raises(UploadRejected, match="not a PDF"):
        check_header(b"MZ\x90\x00 an executable renamed to report.pdf")


def test_size_limits():
    check_size(10, 50)
    with pytest.raises(UploadRejected, match="empty"):
        check_size(0, 50)
    with pytest.raises(UploadRejected, match="larger than 1 MB"):
        check_size(2 * 1024 * 1024, 1024 * 1024)


def test_the_file_name_is_only_a_title_never_a_path():
    assert safe_title("../../etc/passwd") == "passwd"
    assert safe_title("C:\\reports\\Annual Report 2025.PDF") == "Annual Report 2025"
    assert safe_title("bad\x00name\nhere.pdf") == "badnamehere"
    assert safe_title("") == "Uploaded report"
    assert len(safe_title("a" * 500)) == 200


def test_stored_files_live_under_a_random_id_inside_the_upload_folder(tmp_path):
    job_id, doc_id = new_ids()
    assert doc_id.startswith("upload-") and len(doc_id) == len("upload-") + 32 and job_id != doc_id
    assert pdf_path(doc_id, tmp_path).parent == tmp_path.resolve()
    for bad in ("../outside", "upload-../../x", "upload-" + "A" * 32):
        with pytest.raises(ValueError, match="unsafe"):
            pdf_path(bad, tmp_path)


def test_pages_are_counted_from_the_page_tree(tmp_path):
    assert count_pages(write_pdf(tmp_path, ["one", None, "three"])) == 3


def test_a_damaged_pdf_gets_a_clear_message(tmp_path):
    path = tmp_path / "broken.pdf"
    path.write_bytes(b"%PDF-1.4\nthis is not really a pdf")
    with pytest.raises(UploadRejected, match="could not be opened"):
        count_pages(path)


def test_page_and_text_layer_limits():
    check_pages(600, 600)
    with pytest.raises(UploadRejected, match="601 pages; the limit is 600"):
        check_pages(601, 600)
    check_text_layer(5, 10, 0.5)
    with pytest.raises(UploadRejected, match="Only 4 of 10 pages have a text layer"):
        check_text_layer(4, 10, 0.5)


def test_limits_come_from_the_environment_with_the_chosen_defaults():
    assert UploadLimits.from_env({}) == UploadLimits()
    limits = UploadLimits.from_env({"UPLOAD_MAX_MB": "10", "UPLOAD_MAX_PAGES": "100", "UPLOAD_MIN_TEXT_SHARE": "0.8"})
    assert (limits.max_bytes, limits.max_pages, limits.min_text_share) == (10 * 1024 * 1024, 100, 0.8)
    assert UploadLimits().max_bytes == 50 * 1024 * 1024 and UploadLimits().max_documents == 20


# --- the ingestion pipeline (real PDF reading, fake embedder and database) ---

def run(tmp_path, pages, limits=UploadLimits(), **overrides):
    events, loaded = [], {}
    embedder = FakeEmbedder()

    def load(**fields):
        loaded.update(fields)
        return len(fields["index"].chunks)

    result = ingest("upload-test", "My report", write_pdf(tmp_path, pages), limits,
                    lambda *e: events.append(e), lambda: embedder, load, processed_dir=tmp_path / "processed",
                    **overrides)
    return result, events, loaded, embedder


def test_a_text_pdf_is_read_split_embedded_and_loaded_with_progress(tmp_path):
    result, events, loaded, embedder = run(tmp_path, ["Revenue grew 8 percent.", "Net debt fell.", None])
    assert (result.pages, result.pages_without_text) == (3, 1)
    assert [e[:2] for e in events][0] == ("reading", "Checking the file")
    assert ("reading", "Reading 3 pages", 3, 3) in events
    assert ("indexing", "Splitting into passages", 0, 0) in events
    assert events[-1][:2] == ("indexing", "Preparing your workspace")
    assert loaded["title"] == "My report" and loaded["pages"] == 3 and loaded["pages_without_text"] == 1
    assert [c["page"] for c in loaded["index"].chunks] == [1, 2]
    assert embedder.calls == 1
    assert index_paths("upload-test", loaded["model"], tmp_path / "processed").chunks.exists()


def test_too_many_pages_is_refused_before_any_text_is_read(tmp_path):
    read_calls = []
    with pytest.raises(UploadRejected, match="the limit is 2"):
        run(tmp_path, ["a", "b", "c"], UploadLimits(max_pages=2), read=lambda *a, **k: read_calls.append(1))
    assert read_calls == []


def test_a_700_page_pdf_is_refused_at_the_default_limit_before_reading_or_loading_the_model(tmp_path):
    """The bug seen in Docker: a ~1000-page upload was not refused, because the embedding
    model was loaded before the page check (and hung there)."""
    path = tmp_path / "long.pdf"
    path.write_bytes(make_pdf([f"Page {n}" for n in range(1, 701)]))
    calls = []

    def never(name):
        return lambda *a, **k: calls.append(name)

    with pytest.raises(UploadRejected, match="This PDF has 700 pages; the limit is 600"):
        ingest("upload-test", "Long", path, UploadLimits(), lambda *e: None, never("model"), never("load"),
               processed_dir=tmp_path, read=never("read"))
    assert calls == []


def test_a_mostly_scanned_pdf_is_refused_without_indexing(tmp_path):
    with pytest.raises(UploadRejected, match="Only 1 of 3 pages have a text layer"):
        run(tmp_path, ["Only this page has text.", None, None])


def test_the_job_process_checks_the_pages_before_creating_the_embedding_model(tmp_path, monkeypatch):
    """run_job.main as the worker runs it, with the database and the model replaced: the
    700-page PDF must be refused by the page check, and the model never created."""
    from uploads import jobs, run_job

    path = tmp_path / "long.pdf"
    path.write_bytes(make_pdf([f"Page {n}" for n in range(1, 701)]))
    failed = {}

    class ModelLoaded(Exception):
        pass

    def no_model(*args, **kwargs):
        raise ModelLoaded("the embedding model was created before the checks")

    monkeypatch.setattr(run_job, "connect", lambda: object())
    monkeypatch.setattr(run_job, "Embedder", no_model)
    monkeypatch.setattr(run_job, "files_of", lambda doc_id: [])
    monkeypatch.setattr(jobs, "get", lambda conn, job_id: {"id": job_id, "doc_id": "upload-x", "title": "Long"})
    monkeypatch.setattr(jobs, "pdf_path", lambda doc_id: path)
    monkeypatch.setattr(jobs, "update", lambda *args: None)
    monkeypatch.setattr(jobs, "fail", lambda conn, job_id, error: failed.update(error=error))

    assert run_job.main("j1") == 0
    assert failed["error"] == "This PDF has 700 pages; the limit is 600."
