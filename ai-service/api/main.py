"""HTTP API over the existing retrieval and generation code.

Run (from ai-service/):
    uvicorn api.main:app --port 8000

The API only translates HTTP to function calls: search, prompts, guard and
citations are the same code the CLI uses.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException

from generation.answer import Answer, answer_question
from generation.llm import LLMClient
from retrieval.search import Searcher

from .schemas import AskRequest, AskResponse, Citation, Document, Health, Passage, Timings, Usage

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "scripts" / "reports.json"


@dataclass
class Services:
    """What the endpoints need; replaced by fakes in tests."""

    documents: Callable[[], list[Document]]
    searcher_for: Callable[[str, str], Searcher]  # (doc_id, method) -> Searcher
    llm: Callable[[], LLMClient]


def to_response(answer: Answer) -> AskResponse:
    cited = {c.marker for c in answer.check.citations}
    r = answer.response
    return AskResponse(
        status=answer.status,
        answer=answer.rendered,
        question=answer.question,
        search_query=answer.search_query,
        best_score=answer.best_score,
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
        return to_response(answer)

    return app


def default_services() -> Services:
    """Real services: documents from the manifest that have chunks, models loaded on first use."""
    from generation.ask import build_searcher
    from generation.llm import client_from_env
    from retrieval.index import index_paths, load_chunks
    from retrieval.reranker import DEFAULT_RERANKER

    @lru_cache(maxsize=1)
    def documents() -> list[Document]:
        result = []
        for report in json.loads(MANIFEST.read_text(encoding="utf-8")):
            chunks_path = index_paths(report["doc_id"], "unused").chunks
            if chunks_path.exists():
                result.append(Document(doc_id=report["doc_id"], title=report.get("title", report["doc_id"]),
                                       chunks=len(load_chunks(chunks_path))))
        return result

    @lru_cache(maxsize=None)
    def searcher_for(doc_id: str, method: str) -> Searcher:
        return build_searcher(doc_id, method, DEFAULT_RERANKER)

    @lru_cache(maxsize=1)
    def llm() -> LLMClient:
        return client_from_env()

    return Services(documents=documents, searcher_for=searcher_for, llm=llm)


app = create_app(default_services())
