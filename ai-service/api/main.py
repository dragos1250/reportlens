"""HTTP API over the existing retrieval and generation code.

Run (from ai-service/):
    uvicorn api.main:app --port 8000

The API only translates HTTP to function calls: search, prompts, guard and
citations are the same code the CLI uses.
"""

import json
import os
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from generation.answer import Answer, answer_question
from generation.compare import Comparison, Report, compare_reports
from generation.explain import explain_selection
from generation.llm import LLMClient
from retrieval.search import Searcher

from .schemas import (AskRequest, AskResponse, Citation, CompareRequest, CompareResponse, Document, ExplainRequest,
                      ExplainResponse, Health, Passage, Timings, Usage)

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "scripts" / "reports.json"
RAW_DIR = REPO_ROOT / "data" / "raw"  # where scripts/download_reports.py saves <doc_id>.pdf


@dataclass
class Services:
    """What the endpoints need; replaced by fakes in tests."""

    documents: Callable[[], list[Document]]
    searcher_for: Callable[[str, str], Searcher]  # (doc_id, method) -> Searcher
    llm: Callable[[], LLMClient]
    pdf_path: Callable[[str], Path | None] = lambda doc_id: None  # PDF of a known document, if on disk


def shared_fields(answer: Answer | Comparison) -> dict:
    """Fields shared by an answer and a comparison."""
    cited = {c.marker for c in answer.check.citations}
    r = answer.response
    return dict(
        status=answer.status,
        answer=answer.rendered,
        answer_marked=answer.text,
        question=answer.question,
        search_query=answer.search_query,
        best_score=getattr(answer, "best_score", None),
        citations=[Citation(marker=c.marker, doc_id=c.doc_id, page=c.page, chunk_id=c.chunk_id)
                   for c in answer.check.citations],
        passages=[Passage(marker=m, doc_id=c["doc_id"], page=c["page"], chunk_id=c["chunk_id"],
                          text=c["text"], cited=m in cited)
                  for m, c in answer.passages.items()],
        problems=answer.problems,
        model=r.model if r else None,
        usage=Usage(input_tokens=r.input_tokens, output_tokens=r.output_tokens,
                    reasoning_tokens=r.reasoning_tokens) if r else None,
        cost_usd=answer.cost_usd,
        timings=Timings(retrieval_seconds=round(answer.retrieval_seconds, 3),
                        llm_seconds=round(answer.llm_seconds, 3)),
    )


def create_app(services: Services) -> FastAPI:
    app = FastAPI(title="ReportLens AI service")

    @app.get("/health")
    def health() -> Health:
        return Health(status="ok")

    @app.get("/documents")
    def documents() -> list[Document]:
        return services.documents()

    @app.get("/documents/{doc_id}/pdf")
    def pdf(doc_id: str) -> FileResponse:
        """The report PDF. FileResponse answers Range requests (206), so pdf.js can load
        a 32 MB file page by page instead of downloading it whole."""
        if doc_id not in {d.doc_id for d in services.documents()}:
            raise HTTPException(status_code=404, detail=f"unknown doc_id {doc_id!r}")
        path = services.pdf_path(doc_id)
        if path is None or not path.is_file():
            raise HTTPException(status_code=404, detail=f"no PDF on disk for {doc_id!r}")
        return FileResponse(path, media_type="application/pdf", filename=f"{doc_id}.pdf",
                            content_disposition_type="inline")

    @app.post("/explain")
    def explain(request: ExplainRequest) -> ExplainResponse:
        """Explain a selection (or answer a question about it) from that text only: no search."""
        if request.doc_id not in {d.doc_id for d in services.documents()}:
            raise HTTPException(status_code=404, detail=f"unknown doc_id {request.doc_id!r}")
        try:
            result = explain_selection(request.text, request.page, services.llm(), request.question, request.lang)
        except Exception as error:  # provider/network errors; never echo request details or keys
            raise HTTPException(status_code=502, detail=f"explanation failed: {type(error).__name__}")
        r = result.response
        return ExplainResponse(
            status=result.status, answer=result.text, page=result.page, quote=result.quote,
            problems=result.problems, model=r.model if r else None,
            usage=Usage(input_tokens=r.input_tokens, output_tokens=r.output_tokens,
                        reasoning_tokens=r.reasoning_tokens) if r else None,
            cost_usd=result.cost_usd, llm_seconds=round(result.llm_seconds, 3),
        )

    @app.post("/ask")
    def ask(request: AskRequest) -> AskResponse:
        if request.doc_id not in {d.doc_id for d in services.documents()}:
            raise HTTPException(status_code=404, detail=f"unknown doc_id {request.doc_id!r}")
        try:
            answer = answer_question(request.question, services.searcher_for(request.doc_id, request.method),
                                     services.llm(), request.method, lang=request.lang,
                                     translate=request.translate_query)
        except Exception as error:  # provider/network errors; never echo request headers or keys
            raise HTTPException(status_code=502, detail=f"answer generation failed: {type(error).__name__}")
        return AskResponse(**shared_fields(answer))

    @app.post("/compare")
    def compare(request: CompareRequest) -> CompareResponse:
        titles = {d.doc_id: d.title for d in services.documents()}
        unknown = [doc_id for doc_id in request.doc_ids if doc_id not in titles]
        if unknown:
            raise HTTPException(status_code=404, detail=f"unknown doc_id {unknown[0]!r}")
        if request.doc_ids[0] == request.doc_ids[1]:
            raise HTTPException(status_code=422, detail="compare needs two different documents")
        reports = [Report(doc_id, titles[doc_id], services.searcher_for(doc_id, request.method))
                   for doc_id in request.doc_ids]
        try:
            result = compare_reports(request.question, reports, services.llm(), request.method, lang=request.lang,
                                     translate=request.translate_query)
        except Exception as error:  # provider/network errors; never echo request headers or keys
            raise HTTPException(status_code=502, detail=f"comparison failed: {type(error).__name__}")
        return CompareResponse(**shared_fields(result), doc_ids=request.doc_ids,
                               missing_doc_ids=result.missing_doc_ids,
                               best_scores={k: round(v, 4) for k, v in result.best_scores.items()})

    return app


def default_services(store: str | None = None) -> Services:
    """Real services, models loaded on first use. store: "postgres" (default, or env
    RETRIEVAL_STORE) reads documents and vectors from the database; "files" from data/processed/."""
    from generation.ask import build_searcher
    from generation.llm import client_from_env
    from retrieval.index import index_paths, load_chunks
    from retrieval.reranker import DEFAULT_RERANKER
    from storage.factory import DEFAULT_STORE, shared_connection

    store = store or os.environ.get("RETRIEVAL_STORE", DEFAULT_STORE)

    def documents_from_files() -> list[Document]:
        result = []
        for report in json.loads(MANIFEST.read_text(encoding="utf-8")):
            chunks_path = index_paths(report["doc_id"], "unused").chunks
            if chunks_path.exists():
                result.append(Document(doc_id=report["doc_id"], title=report.get("title", report["doc_id"]),
                                       chunks=len(load_chunks(chunks_path))))
        return result

    @lru_cache(maxsize=1)
    def documents() -> list[Document]:
        if store == "files":
            return documents_from_files()
        from storage.pgstore import list_documents
        return [Document(**d) for d in list_documents(shared_connection())]

    @lru_cache(maxsize=None)
    def searcher_for(doc_id: str, method: str) -> Searcher:
        return build_searcher(doc_id, method, DEFAULT_RERANKER, store)

    @lru_cache(maxsize=1)
    def llm() -> LLMClient:
        return client_from_env()

    def pdf_path(doc_id: str) -> Path | None:
        """Only for document ids the database knows (checked by the endpoint), and only
        inside data/raw/: the path is never taken from the request as given."""
        path = (RAW_DIR / f"{doc_id}.pdf").resolve()
        return path if path.parent == RAW_DIR.resolve() else None

    return Services(documents=documents, searcher_for=searcher_for, llm=llm, pdf_path=pdf_path)


app = create_app(default_services())
