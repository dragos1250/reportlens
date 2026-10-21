import pytest

from retrieval.bm25 import BM25, tokenize

# N = 3 documents, lengths 2, 3, 1, average length 2.
DOCS = [["a", "b"], ["a", "c", "c"], ["d"]]


def test_tokenize_lowercases_and_keeps_numbers_whole():
    assert tokenize("Total revenue €40.5 billion; 10,414 in FY26.") == [
        "total", "revenue", "40.5", "billion", "10,414", "in", "fy26",
    ]


def test_tokenize_keeps_letters_with_digits_and_romanian_diacritics():
    assert tokenize("D2D satelit, președintele") == ["d2d", "satelit", "președintele"]


def test_idf_matches_hand_computed_values():
    bm25 = BM25(DOCS)
    assert bm25.idf["a"] == pytest.approx(0.470004, abs=1e-6)  # ln(1.5 / 2.5 + 1)
    assert bm25.idf["c"] == pytest.approx(0.980829, abs=1e-6)  # ln(2.5 / 1.5 + 1)


def test_scores_match_hand_computed_values():
    bm25 = BM25(DOCS)
    # doc 0: tf=1, |D|=2 -> 0.470004 * 2.5 / (1 + 1.5 * 1.0)
    # doc 1: tf=1, |D|=3 -> 0.470004 * 2.5 / (1 + 1.5 * 1.375)
    assert bm25.scores(["a"]).tolist() == pytest.approx([0.470004, 0.383677, 0.0], abs=1e-6)
    # doc 1: tf=2, |D|=3 -> 0.980829 * 5 / (2 + 1.5 * 1.375)
    assert bm25.scores(["c"]).tolist() == pytest.approx([0.0, 1.207174, 0.0], abs=1e-6)


def test_scores_add_up_over_query_terms():
    bm25 = BM25(DOCS)
    combined = bm25.scores(["a", "c"])
    assert combined[1] == pytest.approx(0.383677 + 1.207174, abs=1e-6)


def test_unknown_terms_score_zero():
    assert BM25(DOCS).scores(["zzz"]).tolist() == [0.0, 0.0, 0.0]


def test_top_orders_by_score_and_leaves_out_non_matching_documents():
    assert [row for row, _ in BM25(DOCS).top(["a", "c"], k=10)] == [1, 0]


def test_top_returns_at_most_k():
    assert len(BM25(DOCS).top(["a"], k=1)) == 1
