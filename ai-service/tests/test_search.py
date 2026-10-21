import numpy as np
import pytest

from retrieval.embedder import Embedder
from retrieval.index import Index
from retrieval.reranker import Reranker
from retrieval.search import Searcher, snippet, top_k

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
    """Every query embeds to [0, 1, 0]: semantic ranking is rows 1, 2, 0."""

    def encode(self, texts, **kwargs):
        return np.array([[0.0, 1.0, 0.0]] * len(texts))


class PrefersRevenue:
    """Cross-encoder stand-in: chunks mentioning 'revenue' score high."""

    def predict(self, pairs, **kwargs):
        return [1.0 if "revenue" in text else 0.0 for _, text in pairs]


CHUNKS = [
    {"chunk_id": "c0", "page": 10, "text": "total revenue grew"},
    {"chunk_id": "c1", "page": 11, "text": "board of directors"},
    {"chunk_id": "c2", "page": 12, "text": "satellite partner"},
]


def searcher(reranker=None):
    index = Index(chunks=CHUNKS, vectors=VECTORS, model_name="m")
    return Searcher(index, Embedder("m", model=FixedQueryModel()), reranker)


def pages(hits):
    return [hit.chunk["page"] for hit in hits]


def test_semantic_search_ranks_by_vector_similarity():
    hits = searcher().search("anything", "semantic", k=2)
    assert [(h.rank, h.chunk["page"]) for h in hits] == [(1, 11), (2, 12)]


def test_bm25_search_ranks_by_keywords_and_skips_non_matching():
    assert pages(searcher().search("satellite partner", "bm25", k=3)) == [12]


def test_hybrid_puts_chunk_found_by_both_lists_first():
    # semantic: 1, 2, 0; BM25 for "satellite": 2 only -> 2 is in both lists.
    assert pages(searcher().search("satellite", "hybrid", k=3)) == [12, 11, 10]


def test_hybrid_rerank_reorders_fused_candidates():
    hits = searcher(Reranker("fake", model=PrefersRevenue())).search("satellite", "hybrid+rerank", k=3)
    assert pages(hits)[0] == 10


def test_hybrid_rerank_without_reranker_fails_clearly():
    with pytest.raises(ValueError, match="needs a reranker"):
        searcher().search("q", "hybrid+rerank")


def test_snippet_flattens_whitespace_and_truncates():
    assert snippet("a\n\nb   c") == "a b c"
    assert snippet("word " * 100, n=20) == "word word word word…"
