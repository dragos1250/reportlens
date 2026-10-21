import json

import numpy as np
import pytest

from fakes import FakeLLMClient
from generation.evaluate import count_by_lang, load_questions, refusal_counts, run
from retrieval.embedder import Embedder
from retrieval.index import Index
from retrieval.search import Searcher

CHUNKS = [
    {"chunk_id": f"d-p{p:04d}-c000", "doc_id": "d", "page": p, "text": f"text of page {p}"}
    for p in (11, 38, 85)
]


class FixedQueryModel:
    def encode(self, texts, **kwargs):
        return np.array([[1.0, 0.0, 0.0]] * len(texts))  # page 11 first


SEARCHER = Searcher(Index(CHUNKS, np.eye(3, dtype=np.float32), "m"), Embedder("m", model=FixedQueryModel()))


def question(qid, lang, expected):
    return {"id": qid, "lang": lang, "question": "q", "doc_id": "d", "expected_pages": expected}


def cites_p1():
    return FakeLLMClient(json.dumps({"status": "answered", "answer": "Fact [P1].", "cited": ["P1"]}),
                         input_tokens=1500, output_tokens=800)  # $0.00055 per call


def test_counts_answers_citing_an_expected_page_per_language():
    graded, stopped = run([question("q1", "en", [11]), question("q2", "ro", [85])],
                          lambda doc_id: SEARCHER, cites_p1(), "semantic", 1200, max_cost=1.0)
    assert not stopped
    assert count_by_lang(graded, lambda g: g.cites_expected_page) == {"all": (1, 2), "en": (1, 1), "ro": (0, 1)}
    # Page 85 was sent (3 passages), even though the model cited page 11.
    assert all(g.expected_page_was_sent for g in graded)


def test_translation_is_only_requested_for_non_english_questions():
    answer_json = json.dumps({"status": "not_found", "answer": "x", "cited": []})
    # Calls in order: q1 (en) answer; q2 (ro) translation, then answer.
    llm = FakeLLMClient([answer_json, "translated question", answer_json])
    graded, _ = run([question("q1", "en", [11]), question("q2", "ro", [11])],
                    lambda doc_id: SEARCHER, llm, "semantic", 1200, max_cost=1.0, translate=True)
    assert len(llm.requests) == 3
    assert graded[0].answer.translation is None
    assert graded[1].answer.search_query == "translated question"


def test_translation_is_off_by_default():
    llm = cites_p1()
    run([question("q2", "ro", [11])], lambda doc_id: SEARCHER, llm, "semantic", 1200, max_cost=1.0)
    assert len(llm.requests) == 1


def test_run_stops_when_budget_is_reached():
    questions = [question(f"q{i}", "en", [11]) for i in range(5)]
    llm = cites_p1()
    graded, stopped = run(questions, lambda doc_id: SEARCHER, llm, "semantic", 1200, max_cost=0.001)
    # 0.00055 after one call, 0.0011 after two: the third question is not asked.
    assert stopped
    assert len(graded) == 2 and len(llm.requests) == 2


def unanswerable(qid, lang="en"):
    return {"id": qid, "lang": lang, "question": "q", "doc_id": "d", "answerable": False, "expected_pages": []}


def test_load_questions_defaults_to_answerable_and_allows_no_pages_when_unanswerable(tmp_path):
    path = tmp_path / "q.jsonl"
    path.write_text(
        json.dumps({"id": "a", "lang": "en", "question": "?", "doc_id": "d", "expected_pages": [1]}) + "\n"
        + json.dumps({"id": "b", "lang": "ro", "question": "?", "doc_id": "d", "answerable": False}) + "\n",
        encoding="utf-8")
    first, second = load_questions(path)
    assert first["answerable"] is True
    assert second["answerable"] is False and second["expected_pages"] == []


def test_answerable_question_still_needs_expected_pages(tmp_path):
    path = tmp_path / "q.jsonl"
    path.write_text(json.dumps({"id": "a", "lang": "en", "question": "?", "doc_id": "d"}) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="missing expected_pages"):
        load_questions(path)


def test_refusals_are_counted_per_group_and_layer():
    not_found = json.dumps({"status": "not_found", "answer": "Not in the passages.", "cited": []})
    answered = json.dumps({"status": "answered", "answer": "Fact [P1].", "cited": ["P1"]})
    # Calls: u1 -> not_found (LLM refusal), u2 -> answered (missed refusal), a1 -> not_found (wrong refusal)
    llm = FakeLLMClient([not_found, answered, not_found])
    graded, _ = run([unanswerable("u1"), unanswerable("u2"), question("a1", "en", [11])],
                    lambda doc_id: SEARCHER, llm, "semantic", 1200, max_cost=1.0, min_score=0.5)
    counts = refusal_counts(graded)
    assert counts["unanswerable"] == {"total": 2, "refused": 1, "by_guard": 0, "by_llm": 1}
    assert counts["answerable"] == {"total": 1, "refused": 1, "by_guard": 0, "by_llm": 1}


def test_guard_refusals_make_no_llm_call_and_count_as_refusals():
    llm = cites_p1()
    # Best score is 1.0 here, so a threshold above it refuses everything.
    graded, _ = run([unanswerable("u1"), question("a1", "en", [11])],
                    lambda doc_id: SEARCHER, llm, "semantic", 1200, max_cost=1.0, min_score=1.01)
    assert llm.requests == []
    counts = refusal_counts(graded)
    assert counts["unanswerable"]["by_guard"] == 1 and counts["answerable"]["by_guard"] == 1
