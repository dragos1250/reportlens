"""Search one document's chunks: semantic, keyword (BM25), hybrid, hybrid + reranking.

Usage (from ai-service/):
    python -m retrieval.search "Care a fost venitul total în FY26?" --doc-id vodafone-20f-fy26 -k 5 --method hybrid+rerank
"""

import argparse
from dataclasses import dataclass

import numpy as np

from .bm25 import BM25, tokenize
from .embedder import DEFAULT_MODEL, Embedder
from .hybrid import reciprocal_rank_fusion
from .index import Index, load_index
from .reranker import DEFAULT_RERANKER, Reranker

METHODS = ("semantic", "bm25", "hybrid", "hybrid+rerank")
# Standard values, fixed before looking at results; tuning waits for a dev/test split.
CANDIDATES_PER_LIST = 50  # from each of semantic and BM25, before fusion
RERANK_CANDIDATES = 30  # fused candidates passed to the cross-encoder
SNIPPET_CHARS = 200


@dataclass(frozen=True)
class Hit:
    rank: int
    score: float  # meaning depends on the method: cosine, BM25, RRF or reranker score
    chunk: dict


def top_k(query_vector: np.ndarray, vectors: np.ndarray, k: int) -> list[tuple[int, float]]:
    """(row, score) of the k most similar vectors, best first.

    Vectors are normalised, so the dot product is the cosine similarity.
    Exact search over all rows: fine for a few thousand chunks.
    """
    scores = vectors @ query_vector
    order = np.argsort(-scores, kind="stable")[:k]  # stable: ties keep document order
    return [(int(i), float(scores[i])) for i in order]


class Searcher:
    def __init__(self, index: Index, embedder: Embedder, reranker: Reranker | None = None):
        self.index = index
        self.embedder = embedder
        self.reranker = reranker
        self.bm25 = BM25([tokenize(chunk["text"]) for chunk in index.chunks])

    def best_semantic_score(self, query: str) -> float:
        """Cosine similarity of the closest chunk: a relevance signal for every method.

        Hybrid (RRF) scores only reflect ranks and the reranker is optional, so the
        "not in the report" guard uses this score.
        """
        return float(np.max(self.index.vectors @ self.embedder.embed_query(query)))

    def _semantic(self, query: str, k: int) -> list[tuple[int, float]]:
        return top_k(self.embedder.embed_query(query), self.index.vectors, k)

    def _keyword(self, query: str, k: int) -> list[tuple[int, float]]:
        return self.bm25.top(tokenize(query), k)

    def _hybrid(self, query: str, k: int) -> list[tuple[int, float]]:
        semantic = [row for row, _ in self._semantic(query, CANDIDATES_PER_LIST)]
        keyword = [row for row, _ in self._keyword(query, CANDIDATES_PER_LIST)]
        return reciprocal_rank_fusion([semantic, keyword])[:k]

    def _hybrid_rerank(self, query: str, k: int) -> list[tuple[int, float]]:
        if self.reranker is None:
            raise ValueError("method hybrid+rerank needs a reranker")
        candidates = [row for row, _ in self._hybrid(query, RERANK_CANDIDATES)]
        reranked = self.reranker.rerank(query, [self.index.chunks[row]["text"] for row in candidates])
        return [(candidates[i], score) for i, score in reranked[:k]]

    def search(self, query: str, method: str = "semantic", k: int = 5) -> list[Hit]:
        rank_rows = {
            "semantic": self._semantic,
            "bm25": self._keyword,
            "hybrid": self._hybrid,
            "hybrid+rerank": self._hybrid_rerank,
        }[method]
        return [
            Hit(rank=rank, score=score, chunk=self.index.chunks[row])
            for rank, (row, score) in enumerate(rank_rows(query, k), start=1)
        ]


def snippet(text: str, n: int = SNIPPET_CHARS) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= n else flat[:n].rstrip() + "…"


def main() -> None:
    parser = argparse.ArgumentParser(description="Search a document's chunks.")
    parser.add_argument("query")
    parser.add_argument("--doc-id", required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--method", choices=METHODS, default="semantic")
    parser.add_argument("--reranker", default=DEFAULT_RERANKER)
    parser.add_argument("-k", type=int, default=5)
    args = parser.parse_args()

    reranker = Reranker(args.reranker) if args.method == "hybrid+rerank" else None
    searcher = Searcher(load_index(args.doc_id, args.model), Embedder(args.model), reranker)

    print(f" #  score   page  chunk_id")
    for hit in searcher.search(args.query, args.method, args.k):
        print(f"{hit.rank:2d}  {hit.score:.3f}  p.{hit.chunk['page']:<4d}{hit.chunk['chunk_id']}")
        print(f"    {snippet(hit.chunk['text'])}")


if __name__ == "__main__":
    main()
