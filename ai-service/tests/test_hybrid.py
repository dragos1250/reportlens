import pytest

from retrieval.hybrid import reciprocal_rank_fusion


def test_scores_are_sums_of_reciprocal_ranks():
    fused = dict(reciprocal_rank_fusion([[7, 8], [8, 9]], k=60))
    assert fused[7] == pytest.approx(1 / 61)
    assert fused[8] == pytest.approx(1 / 62 + 1 / 61)
    assert fused[9] == pytest.approx(1 / 62)


def test_row_found_by_both_rankings_beats_rows_found_by_one():
    fused = reciprocal_rank_fusion([[1, 2, 3], [3, 4, 5]])
    assert fused[0][0] == 3


def test_ties_keep_first_seen_order():
    # 10 and 20 are both first in one ranking: equal scores.
    assert [row for row, _ in reciprocal_rank_fusion([[10], [20]])] == [10, 20]


def test_single_ranking_keeps_its_order():
    assert [row for row, _ in reciprocal_rank_fusion([[5, 3, 9]])] == [5, 3, 9]


def test_empty_rankings():
    assert reciprocal_rank_fusion([[], []]) == []
