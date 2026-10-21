import json

import numpy as np

from fakes import FakeLLMClient
from generation.answer import answer_question
from generation.prompt import ANSWER_SCHEMA, SYSTEM_PROMPT
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
        return np.array([[1.0, 0.0, 0.0]] * len(texts))


def searcher():
    index = Index(chunks=CHUNKS, vectors=np.eye(3, dtype=np.float32), model_name="m")
    return Searcher(index, Embedder("m", model=FixedQueryModel()))


def llm_output(status, answer, cited):
    return json.dumps({"status": status, "answer": answer, "cited": cited})


def test_answer_cites_pages_of_passages_sent():
    llm = FakeLLMClient(llm_output("answered", "Revenue was €40.5 billion [P1].", ["P1"]))
    answer = answer_question("total revenue", searcher(), llm, method="semantic")
    assert answer.status == "answered"
    assert answer.check.pages == [11]
    assert answer.rendered == "Revenue was €40.5 billion [d, p. 11]."
    assert answer.problems == []


def test_llm_gets_system_prompt_schema_limit_and_at_most_max_passages():
    llm = FakeLLMClient(llm_output("not_found", "Not in the passages.", []))
    answer_question("q", searcher(), llm, method="semantic", max_passages=2, max_output_tokens=1200)
    request = llm.requests[0]
    assert request["system"] == SYSTEM_PROMPT
    assert request["json_schema"] == ANSWER_SCHEMA
    assert request["max_output_tokens"] == 1200
    assert request["user"].count("<passage ") == 2


def test_not_found_is_reported_as_such():
    llm = FakeLLMClient(llm_output("not_found", "The passages do not contain this.", []))
    answer = answer_question("q", searcher(), llm, method="semantic")
    assert answer.status == "not_found" and answer.problems == []


def test_invented_passage_id_is_flagged():
    llm = FakeLLMClient(llm_output("answered", "Claim [P9].", ["P9"]))
    answer = answer_question("q", searcher(), llm, method="semantic")
    assert answer.check.invalid == ["P9"]
    assert answer.problems


def test_incomplete_output_is_reported():
    llm = FakeLLMClient("", incomplete_reason="max_output_tokens")
    answer = answer_question("q", searcher(), llm, method="semantic")
    assert answer.status == "incomplete"
    assert "max_output_tokens" in answer.problems[0]


def test_output_that_is_not_json_is_reported():
    answer = answer_question("q", searcher(), FakeLLMClient("plain text"), method="semantic")
    assert answer.status == "invalid_output"


def test_cost_comes_from_token_counts():
    llm = FakeLLMClient(llm_output("not_found", "x", []), input_tokens=1500, output_tokens=800)
    answer = answer_question("q", searcher(), llm, method="semantic")
    assert round(answer.cost_usd, 8) == 0.00055
