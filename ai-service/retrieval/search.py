"""Semantic search over one document's chunks.

Usage (from ai-service/):
    python -m retrieval.search "Care a fost venitul total în FY26?" --doc-id vodafone-20f-fy26 -k 5
"""

import argparse
from dataclasses import dataclass

import numpy as np

from .embedder import DEFAULT_MODEL, Embedder
from .index import Index, load_index

SNIPPET_CHARS = 200


@dataclass(frozen=True)
class Hit:
    rank: int
    score: float
    chunk: dict


def top_k(query_vector: np.ndarray, vectors: np.ndarray, k: int) -> list[tuple[int, float]]:
    """(row, score) of the k most similar vectors, best first.

    Vectors are normalised, so the dot product is the cosine similarity.
    Exact search over all rows: fine for a few thousand chunks.
    """
    scores = vectors @ query_vector
    order = np.argsort(-scores, kind="stable")[:k]  # stable: ties keep document order
    return [(int(i), float(scores[i])) for i in order]


def search(index: Index, embedder: Embedder, query: str, k: int = 5) -> list[Hit]:
    query_vector = embedder.embed_query(query)
    return [
        Hit(rank=rank, score=score, chunk=index.chunks[row])
        for rank, (row, score) in enumerate(top_k(query_vector, index.vectors, k), start=1)
    ]


def snippet(text: str, n: int = SNIPPET_CHARS) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= n else flat[:n].rstrip() + "…"


def main() -> None:
    parser = argparse.ArgumentParser(description="Search a document's chunks.")
    parser.add_argument("query")
    parser.add_argument("--doc-id", required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("-k", type=int, default=5)
    args = parser.parse_args()

    index = load_index(args.doc_id, args.model)
    hits = search(index, Embedder(args.model), args.query, args.k)

    print(f" #  score   page  chunk_id")
    for hit in hits:
        print(f"{hit.rank:2d}  {hit.score:.3f}  p.{hit.chunk['page']:<4d}{hit.chunk['chunk_id']}")
        print(f"    {snippet(hit.chunk['text'])}")


if __name__ == "__main__":
    main()
