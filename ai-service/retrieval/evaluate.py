"""Measure retrieval quality: hit@k on hand-written questions.

Usage (from ai-service/):
    python -m retrieval.evaluate ../eval/retrieval_questions.jsonl --method hybrid+rerank \
        [--model intfloat/multilingual-e5-base] [--reranker BAAI/bge-reranker-v2-m3]
"""

import argparse
import json
import statistics
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .embedder import DEFAULT_MODEL, Embedder
from .index import load_index
from .reranker import DEFAULT_RERANKER, Reranker
from .search import METHODS, Hit, Searcher, snippet

REQUIRED_FIELDS = ("id", "lang", "question", "doc_id", "expected_pages")
KS = (5, 10, 20)


@dataclass
class Result:
    question: dict
    hits: list[Hit]
    seconds: float = 0.0

    @property
    def pages(self) -> list[int]:
        return [hit.chunk["page"] for hit in self.hits]

    @property
    def first_hit_rank(self) -> int | None:
        """Rank (1-based) of the first chunk on an expected page, None if missed."""
        expected = set(self.question["expected_pages"])
        return next((rank for rank, page in enumerate(self.pages, start=1) if page in expected), None)


class TimedReranker:
    """Wraps a reranker and records how long each call takes."""

    def __init__(self, reranker: Reranker):
        self._reranker = reranker
        self.seconds: list[float] = []

    def rerank(self, query: str, texts: list[str]) -> list[tuple[int, float]]:
        start = time.perf_counter()
        ranked = self._reranker.rerank(query, texts)
        self.seconds.append(time.perf_counter() - start)
        return ranked


def load_questions(path: Path) -> list[dict]:
    questions = []
    with path.open(encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            if not line.strip():
                continue
            question = json.loads(line)
            missing = [field for field in REQUIRED_FIELDS if field not in question]
            if missing:
                raise ValueError(f"{path.name}:{line_number}: missing {', '.join(missing)}")
            questions.append(question)
    return questions


def hit_rate_by_lang(results: list[Result], k: int) -> dict[str, tuple[int, int]]:
    """{"all": (hits, total), "<lang>": (hits, total), ...}: an expected page within the top k."""
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for result in results:
        rank = result.first_hit_rank
        hit = rank is not None and rank <= k
        for key in ("all", result.question["lang"]):
            counts[key][0] += hit
            counts[key][1] += 1
    return {key: (hits, total) for key, (hits, total) in counts.items()}


def describe_seconds(values: list[float]) -> str:
    return f"median {statistics.median(values):.2f}s, max {max(values):.2f}s"


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate retrieval with hit@5/10/20.")
    parser.add_argument("questions", type=Path)
    parser.add_argument("--method", choices=METHODS, default="semantic")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--reranker", default=DEFAULT_RERANKER)
    args = parser.parse_args()

    questions = load_questions(args.questions)
    embedder = Embedder(args.model)
    reranker = TimedReranker(Reranker(args.reranker)) if args.method == "hybrid+rerank" else None
    searchers: dict[str, Searcher] = {}
    for doc_id in {q["doc_id"] for q in questions}:
        searchers[doc_id] = Searcher(load_index(doc_id, args.model), embedder, reranker)

    # Warm-up query, not measured: the first call pays one-off setup costs.
    first = questions[0]
    searchers[first["doc_id"]].search(first["question"], args.method, max(KS))
    if reranker:
        reranker.seconds.clear()

    results = []
    for question in questions:
        start = time.perf_counter()
        hits = searchers[question["doc_id"]].search(question["question"], args.method, max(KS))
        results.append(Result(question, hits, time.perf_counter() - start))

    label = args.method + (f" ({args.reranker})" if reranker else "")
    print(f"method: {label}\nembedding model: {args.model}\n")
    print(f"id   lang  rank  expected        top-5 pages")
    for r in results:
        print(f"{r.question['id']:<4} {r.question['lang']:<5} {r.first_hit_rank or '>20':<5} "
              f"{str(r.question['expected_pages']):<15} {r.pages[:5]}")

    print()
    for k in KS:
        rates = hit_rate_by_lang(results, k)
        print(f"hit@{k:<3}" + "  ".join(f"{key} {h}/{t}" for key, (h, t) in sorted(rates.items())))

    print(f"\ntime per question (warm): {describe_seconds([r.seconds for r in results])}")
    if reranker:
        print(f"reranker, {len(reranker.seconds)} calls: {describe_seconds(reranker.seconds)}")

    for r in results:
        if r.first_hit_rank is None or r.first_hit_rank > 5:
            print(f"\nMISS@5 {r.question['id']} ({r.question['lang']}): {r.question['question']}")
            for hit in r.hits[:5]:
                print(f"  {hit.rank}. {hit.score:.3f} p.{hit.chunk['page']:<4} {snippet(hit.chunk['text'], 160)}")


if __name__ == "__main__":
    main()
