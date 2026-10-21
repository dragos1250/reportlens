import numpy as np

from retrieval.embedder import Embedder
from retrieval.index import Index
from retrieval.search import search, snippet, top_k

VECTORS = np.array([
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.6, 0.8, 0.0],
], dtype=np.float32)


def test_top_k_orders_by_dot_product():
    assert top_k(np.array([0.0, 1.0, 0.0]), VECTORS, k=3) == [(1, 1.0), (2, 0.800000011920929), (0, 0.0)]


def test_top_k_returns_at_most_k_and_at_most_all_rows():
    query = np.array([1.0, 0.0, 0.0])
    assert [row for row, _ in top_k(query, VECTORS, k=1)] == [0]
    assert len(top_k(query, VECTORS, k=10)) == 3


def test_top_k_keeps_document_order_on_ties():
    assert [row for row, _ in top_k(np.array([0.0, 0.0, 1.0]), VECTORS, k=3)] == [0, 1, 2]


class FixedQueryModel:
    def encode(self, texts, **kwargs):
        return np.array([[0.0, 1.0, 0.0]] * len(texts))


def test_search_returns_ranked_hits_with_chunk_metadata():
    chunks = [{"chunk_id": f"c{i}", "page": i + 10, "text": "t"} for i in range(3)]
    index = Index(chunks=chunks, vectors=VECTORS, model_name="m")
    hits = search(index, Embedder("m", model=FixedQueryModel()), "q", k=2)
    assert [(h.rank, h.chunk["page"]) for h in hits] == [(1, 11), (2, 12)]


def test_snippet_flattens_whitespace_and_truncates():
    assert snippet("a\n\nb   c") == "a b c"
    assert snippet("word " * 100, n=20) == "word word word word…"
