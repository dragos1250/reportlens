"""Combine several rankings with Reciprocal Rank Fusion (Cormack et al., 2009).

score(d) = sum over rankings of 1 / (k + rank of d in that ranking)

Only ranks are used, not scores: cosine similarities and BM25 scores live on
different scales, and RRF needs no normalisation and no weights to tune.
"""

from collections import defaultdict

# Standard value from the original paper; not tuned on our questions.
RRF_K = 60


def reciprocal_rank_fusion(rankings: list[list[int]], k: int = RRF_K) -> list[tuple[int, float]]:
    """Fuse rankings (lists of rows, best first) into (row, score), best first.

    A row missing from a ranking simply gets nothing from it. Ties keep the order
    in which rows were first seen (earlier rankings first).
    """
    scores: dict[int, float] = defaultdict(float)
    for ranking in rankings:
        for rank, row in enumerate(ranking, start=1):
            scores[row] += 1 / (k + rank)
    return sorted(scores.items(), key=lambda item: -item[1])  # sorted() is stable
