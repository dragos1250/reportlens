import json

import pytest

from retrieval.evaluate import Result, TimedReranker, hit_rate_by_lang, load_questions
from retrieval.search import Hit


def result(lang, expected, retrieved):
    hits = [Hit(rank=i, score=0.0, chunk={"page": p}) for i, p in enumerate(retrieved, start=1)]
    return Result(question={"lang": lang, "expected_pages": expected}, hits=hits)


def test_first_hit_rank_is_rank_of_first_expected_page():
    assert result("en", [17, 11], [5, 11, 17]).first_hit_rank == 2


def test_first_hit_rank_is_none_when_no_expected_page_is_retrieved():
    assert result("en", [38], [1, 2, 3, 4, 5]).first_hit_rank is None


def test_hit_rate_counts_overall_and_per_language():
    results = [
        result("en", [1], [1]),
        result("en", [2], [9]),
        result("ro", [3], [3]),
    ]
    assert hit_rate_by_lang(results, k=5) == {"all": (2, 3), "en": (1, 2), "ro": (1, 1)}


def test_hit_rate_only_counts_hits_within_k():
    results = [result("en", [7], [1, 2, 3, 4, 5, 6, 7])]  # expected page at rank 7
    assert hit_rate_by_lang(results, k=5)["all"] == (0, 1)
    assert hit_rate_by_lang(results, k=10)["all"] == (1, 1)


def test_timed_reranker_records_each_call():
    class Instant:
        def rerank(self, query, texts):
            return [(0, 1.0)]

    timed = TimedReranker(Instant())
    assert timed.rerank("q", ["t"]) == [(0, 1.0)]
    timed.rerank("q", ["t"])
    assert len(timed.seconds) == 2 and all(s >= 0 for s in timed.seconds)


def test_load_questions_skips_blank_lines(tmp_path):
    path = tmp_path / "q.jsonl"
    question = {"id": "q01", "lang": "en", "question": "?", "doc_id": "d", "expected_pages": [1]}
    path.write_text(json.dumps(question) + "\n\n", encoding="utf-8")
    assert load_questions(path) == [question]


def test_load_questions_reports_missing_fields_with_line_number(tmp_path):
    path = tmp_path / "q.jsonl"
    path.write_text(json.dumps({"id": "q01", "question": "?"}) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match=r"q.jsonl:1: missing lang, doc_id, expected_pages"):
        load_questions(path)
