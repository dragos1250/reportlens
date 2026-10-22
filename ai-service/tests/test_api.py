import json

import numpy as np
from fastapi.testclient import TestClient

from api.main import Services, create_app
from api.schemas import Document
from fakes import FakeLLMClient
from retrieval.embedder import Embedder
from retrieval.index import Index
from retrieval.search import Searcher

CHUNKS = [
    {"chunk_id": f"d-p{p:04d}-c000", "doc_id": "d", "page": p, "text": text}
    for p, text in [(11, "Total revenue grew 8.0% to €40.5 billion."),
                    (38, "We are partnering with AST SpaceMobile."),
                    (85, "The Chair of the Board leads the Board.")]
]


class FixedQueryModel:
    def encode(self, texts, **kwargs):
        return np.array([[1.0, 0.0, 0.0]] * len(texts))  # closest chunk: page 11, score 1.0


def client(llm_text: str | list[str]) -> tuple[TestClient, FakeLLMClient]:
    llm = FakeLLMClient(llm_text)
    searcher = Searcher(Index(CHUNKS, np.eye(3, dtype=np.float32), "m"), Embedder("m", model=FixedQueryModel()))
    services = Services(documents=lambda: [Document(doc_id="d", title="Test report", chunks=3)],
                        searcher_for=lambda doc_id, method: searcher, llm=lambda: llm)
    return TestClient(create_app(services)), llm


def llm_output(status, answer, cited):
    return json.dumps({"status": status, "answer": answer, "cited": cited})


def test_health():
    api, _ = client("unused")
    assert api.get("/health").json() == {"status": "ok"}


def test_documents_lists_available_reports():
    api, _ = client("unused")
    assert api.get("/documents").json() == [{"doc_id": "d", "title": "Test report", "chunks": 3}]


def test_ask_returns_answer_with_citations_passages_and_cost():
    api, llm = client(llm_output("answered", "Revenue was €40.5 billion [P1].", ["P1"]))
    response = api.post("/ask", json={"question": "Total revenue?", "doc_id": "d", "method": "semantic"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["answer"] == "Revenue was €40.5 billion [d, p. 11]."
    assert body["citations"] == [{"marker": "P1", "doc_id": "d", "page": 11, "chunk_id": "d-p0011-c000"}]
    assert body["passages"][0]["cited"] is True and body["passages"][1]["cited"] is False
    assert body["passages"][0]["text"].startswith("Total revenue")
    assert body["model"] == "gpt-6-luna"
    assert body["usage"]["input_tokens"] == 1000
    assert body["cost_usd"] > 0
    assert len(llm.requests) == 1


def test_lang_is_optional_and_reaches_the_prompt():
    api, llm = client(llm_output("not_found", "Nu apare în pasaje.", []))
    body = api.post("/ask", json={"question": "Câți bitcoini?", "doc_id": "d", "lang": "ro",
                                  "method": "semantic"}).json()
    assert body["status"] == "not_found"
    assert llm.requests[0]["system"].endswith("Write the answer in Romanian.")


def test_guard_refusal_has_no_model_usage_or_cost():
    # Every chunk is a weak match for the query vector [1, 0, 0]: best score 0.5 < 0.75.
    weak = np.array([[0.5, 0.866, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], dtype=np.float32)
    llm = FakeLLMClient("unused")
    searcher = Searcher(Index(CHUNKS, weak, "m"), Embedder("m", model=FixedQueryModel()))
    services = Services(documents=lambda: [Document(doc_id="d", title="t", chunks=3)],
                        searcher_for=lambda doc_id, method: searcher, llm=lambda: llm)
    body = TestClient(create_app(services)).post(
        "/ask", json={"question": "Care este capitala Franței?", "doc_id": "d", "lang": "ro"}).json()
    assert body["status"] == "not_in_report"
    assert body["answer"] == "Raportul nu pare să conțină informații despre această întrebare."
    assert body["model"] is None and body["usage"] is None and body["cost_usd"] == 0.0
    assert body["passages"] == [] and body["best_score"] < 0.75
    assert llm.requests == []


def test_unknown_document_is_404():
    api, llm = client("unused")
    response = api.post("/ask", json={"question": "q", "doc_id": "missing"})
    assert response.status_code == 404
    assert llm.requests == []


def test_invalid_requests_are_rejected_before_any_work():
    api, llm = client("unused")
    assert api.post("/ask", json={"question": "", "doc_id": "d"}).status_code == 422
    assert api.post("/ask", json={"question": "q", "doc_id": "d", "lang": "romanian"}).status_code == 422
    assert api.post("/ask", json={"question": "q", "doc_id": "d", "method": "magic"}).status_code == 422
    assert llm.requests == []


def test_llm_failure_becomes_502_without_details():
    class Broken:
        model = "gpt-6-luna"

        def generate(self, *args, **kwargs):
            raise RuntimeError("connection reset; api_key=sk-secret")

    searcher = Searcher(Index(CHUNKS, np.eye(3, dtype=np.float32), "m"), Embedder("m", model=FixedQueryModel()))
    services = Services(documents=lambda: [Document(doc_id="d", title="t", chunks=3)],
                        searcher_for=lambda doc_id, method: searcher, llm=lambda: Broken())
    response = TestClient(create_app(services)).post("/ask", json={"question": "q", "doc_id": "d",
                                                                   "method": "semantic"})
    assert response.status_code == 502
    assert "sk-secret" not in response.text


PDF_BYTES = b"%PDF-1.7\n" + bytes(range(256)) * 40 + b"\n%%EOF\n"


def pdf_client(tmp_path, known=("d",)):
    (tmp_path / "d.pdf").write_bytes(PDF_BYTES)
    services = Services(documents=lambda: [Document(doc_id=k, title="t", chunks=1) for k in known],
                        searcher_for=lambda doc_id, method: None, llm=lambda: None,
                        pdf_path=lambda doc_id: tmp_path / f"{doc_id}.pdf")
    return TestClient(create_app(services))


def test_pdf_is_served_whole(tmp_path):
    response = pdf_client(tmp_path).get("/documents/d/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["accept-ranges"] == "bytes"
    assert response.content == PDF_BYTES


def test_pdf_range_request_returns_only_that_part(tmp_path):
    response = pdf_client(tmp_path).get("/documents/d/pdf", headers={"Range": "bytes=0-99"})
    assert response.status_code == 206
    assert response.headers["content-range"] == f"bytes 0-99/{len(PDF_BYTES)}"
    assert response.content == PDF_BYTES[:100]


def test_pdf_of_unknown_document_is_404_even_if_a_file_exists(tmp_path):
    (tmp_path / "secret.pdf").write_bytes(PDF_BYTES)
    assert pdf_client(tmp_path).get("/documents/secret/pdf").status_code == 404


def test_known_document_without_pdf_file_is_404(tmp_path):
    assert pdf_client(tmp_path, known=("d", "other")).get("/documents/other/pdf").status_code == 404


def test_default_pdf_path_stays_inside_the_raw_folder():
    from api.main import RAW_DIR, default_services
    pdf_path = default_services(store="files").pdf_path
    assert pdf_path("vodafone-20f-fy26") == (RAW_DIR / "vodafone-20f-fy26.pdf").resolve()
    assert pdf_path("../../.env") is None


def test_answer_marked_keeps_the_passage_markers():
    api, _ = client(llm_output("answered", "Revenue was €40.5 billion [P1].", ["P1"]))
    body = api.post("/ask", json={"question": "Total revenue?", "doc_id": "d", "method": "semantic"}).json()
    assert body["answer_marked"] == "Revenue was €40.5 billion [P1]."
    assert body["answer"] == "Revenue was €40.5 billion [d, p. 11]."
