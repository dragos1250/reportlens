"""Answer a question: retrieve passages, ask the LLM, verify the citations."""

import json
import time
from dataclasses import dataclass, field

from retrieval.search import Searcher

from .citations import CitationCheck, check_citations, render
from .llm import LLMClient, LLMResponse
from .pricing import cost_usd
from .prompt import ANSWER_SCHEMA, SYSTEM_PROMPT, build_user_message
from .translate import SEARCH_LANGUAGE, Translation, translate_query

MAX_PASSAGES = 5
DEFAULT_MAX_OUTPUT_TOKENS = 1200  # includes reasoning tokens
DEFAULT_METHOD = "hybrid"


@dataclass
class Answer:
    question: str
    # "answered", "not_found", "incomplete" (hit max_output_tokens), "invalid_output" (not the expected JSON)
    status: str
    text: str  # as written by the model, with [P#] markers
    passages: dict[str, dict]  # {"P1": chunk, ...} as sent to the model
    check: CitationCheck
    response: LLMResponse
    retrieval_seconds: float  # includes the translation call, if any
    llm_seconds: float
    problems: list[str] = field(default_factory=list)
    search_query: str = ""  # what the search used: the question, or its translation
    translation: LLMResponse | None = None  # None when no translation call was made

    @property
    def rendered(self) -> str:
        return render(self.text, self.passages)

    @property
    def translation_cost_usd(self) -> float | None:
        return cost_usd(self.translation) if self.translation else 0.0

    @property
    def cost_usd(self) -> float | None:
        """Total: answer plus translation. None if either price is unknown."""
        answer_cost, translation_cost = cost_usd(self.response), self.translation_cost_usd
        if answer_cost is None or translation_cost is None:
            return None
        return answer_cost + translation_cost


def answer_question(question: str, searcher: Searcher, llm: LLMClient, method: str = DEFAULT_METHOD,
                    max_passages: int = MAX_PASSAGES,
                    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
                    lang: str = SEARCH_LANGUAGE, translate: bool = False) -> Answer:
    """translate=True searches with an English translation of a non-English question;
    the answer is still generated for the original question."""
    start = time.perf_counter()
    translation = translate_query(question, lang, llm) if translate else Translation(question, None)
    chunks = [hit.chunk for hit in searcher.search(translation.text, method, max_passages)]
    user_message, passages = build_user_message(question, chunks)
    retrieved = time.perf_counter()
    response = llm.generate(SYSTEM_PROMPT, user_message, max_output_tokens=max_output_tokens,
                            json_schema=ANSWER_SCHEMA)
    done = time.perf_counter()

    def result(status: str, text: str, check: CitationCheck, problems: list[str]) -> Answer:
        return Answer(question, status, text, passages, check, response,
                      retrieved - start, done - retrieved, problems,
                      search_query=translation.text, translation=translation.response)

    if response.incomplete_reason:
        return result("incomplete", response.text, CitationCheck([]),
                      [f"model stopped early: {response.incomplete_reason}"])
    try:
        output = json.loads(response.text)
        status, text, declared = output["status"], output["answer"], output["cited"]
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        return result("invalid_output", response.text, CitationCheck([]),
                      [f"output is not the expected JSON: {error}"])

    check = check_citations(status, text, declared, passages)
    return result(status, text, check, list(check.problems))
