import json

import numpy as np

from fakes import FakeLLMClient
from generation.evaluate import count_by_lang, run
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


def test_run_stops_when_budget_is_reached():
    questions = [question(f"q{i}", "en", [11]) for i in range(5)]
    llm = cites_p1()
    graded, stopped = run(questions, lambda doc_id: SEARCHER, llm, "semantic", 1200, max_cost=0.001)
    # 0.00055 after one call, 0.0011 after two: the third question is not asked.
    assert stopped
    assert len(graded) == 2 and len(llm.requests) == 2
