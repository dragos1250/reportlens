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


def test_known_language_is_stated_in_the_system_prompt():
    llm = FakeLLMClient(llm_output("not_found", "Nu apare.", []))
    answer_question("Câți bitcoini deține Vodafone?", searcher(), llm, method="semantic", lang="ro")
    system = llm.requests[0]["system"]
    assert system.startswith(SYSTEM_PROMPT)
    assert system.endswith("The question is in Romanian. Write the answer in Romanian.")


def test_unknown_language_keeps_the_original_system_prompt():
    llm = FakeLLMClient(llm_output("not_found", "x", []))
    answer_question("q", searcher(), llm, method="semantic")
    assert llm.requests[0]["system"] == SYSTEM_PROMPT


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


def test_without_translation_the_question_itself_is_searched_and_no_extra_call_is_made():
    llm = FakeLLMClient(llm_output("not_found", "x", []))
    answer = answer_question("Cu ce companie colaborează?", searcher(), llm, method="bm25", lang="ro")
    assert answer.search_query == "Cu ce companie colaborează?"
    assert answer.translation is None and len(llm.requests) == 1


def test_translated_query_is_searched_but_answer_is_for_original_question():
    # BM25 finds page 38 only through the English words of the translation.
    llm = FakeLLMClient(["Which company is Vodafone partnering with?",
                         llm_output("answered", "AST SpaceMobile [P1].", ["P1"])])
    answer = answer_question("Cu ce companie colaborează Vodafone?", searcher(), llm,
                             method="bm25", lang="ro", translate=True)
    assert answer.search_query == "Which company is Vodafone partnering with?"
    assert answer.check.pages == [38]
    answer_prompt = llm.requests[1]["user"]
    assert "Cu ce companie colaborează Vodafone?" in answer_prompt
    assert "Which company" not in answer_prompt


def test_english_question_with_translation_enabled_makes_no_translation_call():
    llm = FakeLLMClient(llm_output("not_found", "x", []))
    answer = answer_question("Who is the Chair?", searcher(), llm, method="bm25", lang="en", translate=True)
    assert answer.translation is None and len(llm.requests) == 1


def test_total_cost_includes_translation():
    llm = FakeLLMClient(["partnering", llm_output("not_found", "x", [])],
                        input_tokens=1500, output_tokens=800)  # $0.00055 per call
    answer = answer_question("q", searcher(), llm, method="bm25", lang="ro", translate=True)
    assert round(answer.translation_cost_usd, 8) == 0.00055
    assert round(answer.cost_usd, 8) == 0.0011


def test_guard_refuses_weak_matches_without_calling_the_llm():
    llm = FakeLLMClient(llm_output("answered", "Guess [P1].", ["P1"]))
    # The fixed query vector scores 1.0 against the closest chunk.
    answer = answer_question("q", searcher(), llm, method="semantic", lang="ro", min_score=1.01)
    assert answer.status == "not_in_report"
    assert answer.text == "Raportul nu pare să conțină informații despre această întrebare."
    assert llm.requests == []
    assert answer.response is None and answer.passages == {}
    assert answer.cost_usd == 0.0
    assert answer.best_score == 1.0


def test_guard_lets_good_matches_through_and_records_the_score():
    llm = FakeLLMClient(llm_output("answered", "Revenue [P1].", ["P1"]))
    answer = answer_question("q", searcher(), llm, method="semantic", min_score=0.75)
    assert answer.status == "answered" and len(llm.requests) == 1
    assert answer.best_score == 1.0


def test_guard_can_be_turned_off():
    llm = FakeLLMClient(llm_output("not_found", "x", []))
    answer_question("q", searcher(), llm, method="semantic", min_score=-1)
    assert len(llm.requests) == 1


def test_cost_comes_from_token_counts():
    llm = FakeLLMClient(llm_output("not_found", "x", []), input_tokens=1500, output_tokens=800)
    answer = answer_question("q", searcher(), llm, method="semantic")
    assert round(answer.cost_usd, 8) == 0.00055
