"""Request and response shapes of the AI service HTTP API."""

from typing import Literal

from pydantic import BaseModel, Field

from retrieval.search import METHODS

Method = Literal[METHODS]  # "semantic", "bm25", "hybrid", "hybrid+rerank"


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    doc_id: str = Field(min_length=1, max_length=200)
    lang: str | None = Field(default=None, pattern=r"^[a-z]{2}$",
                             description="language of the question, e.g. 'ro'; omitted = unknown")
    method: Method = "hybrid"
    translate_query: bool = False


class CompareRequest(BaseModel):
    """Compare two reports: each is searched separately and the answer cites both."""

    question: str = Field(min_length=1, max_length=1000)
    doc_ids: list[str] = Field(min_length=2, max_length=2)
    lang: str | None = Field(default=None, pattern=r"^[a-z]{2}$")
    method: Method = "hybrid"
    translate_query: bool = False


class Passage(BaseModel):
    marker: str  # "P1".. as sent to the model
    doc_id: str
    page: int
    chunk_id: str
    text: str
    cited: bool


class Citation(BaseModel):
    marker: str
    doc_id: str
    page: int
    chunk_id: str


class Usage(BaseModel):
    input_tokens: int
    output_tokens: int
    reasoning_tokens: int


class Timings(BaseModel):
    retrieval_seconds: float
    llm_seconds: float


class AskResponse(BaseModel):
    # answered | not_found (LLM) | not_in_report (guard) | incomplete | invalid_output
    status: str
    answer: str  # citations rendered as [doc, p. N]
    answer_marked: str  # the same text with the model's [P1].. markers, for clickable citations
    question: str
    search_query: str
    best_score: float | None
    citations: list[Citation]
    passages: list[Passage]
    problems: list[str]
    model: str | None  # None when the guard refused before calling the LLM
    usage: Usage | None
    cost_usd: float | None
    timings: Timings


class CompareResponse(AskResponse):
    # answered (cites both) | partial (one report only) | not_found | not_in_report (guard, both)
    # | incomplete | invalid_output. best_score is None: see best_scores.
    doc_ids: list[str]
    missing_doc_ids: list[str]  # reports that do not cover the question (partial, not_in_report)
    best_scores: dict[str, float]


class Document(BaseModel):
    doc_id: str
    title: str
    chunks: int


class Health(BaseModel):
    status: Literal["ok"]


class ExplainRequest(BaseModel):
    """Select & explain: the reader's selection on one page; with a question for "Ask about this"."""

    doc_id: str = Field(min_length=1, max_length=200)
    page: int = Field(ge=1)
    # Longer than the guard's limit on purpose: a long selection gets a calm "too_long"
    # answer from the guard instead of a validation error.
    text: str = Field(min_length=1, max_length=20000)
    question: str | None = Field(default=None, max_length=1000)
    lang: str | None = Field(default=None, pattern=r"^[a-z]{2}$")


class ExplainResponse(BaseModel):
    # explained | not_enough (model) | too_short | too_long | no_text (guard, no LLM call)
    # | incomplete | invalid_output
    status: str
    answer: str
    page: int
    quote: str  # the selection as explained (whitespace normalised)
    problems: list[str]
    model: str | None
    usage: Usage | None
    cost_usd: float | None
    llm_seconds: float
