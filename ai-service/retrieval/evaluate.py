"""Measure retrieval quality: hit@k on hand-written questions.

Usage (from ai-service/):
    python -m retrieval.evaluate ../eval/retrieval_questions.jsonl [--model intfloat/multilingual-e5-base]
"""

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .embedder import DEFAULT_MODEL, Embedder
from .index import Index, load_index
from .search import Hit, search, snippet

REQUIRED_FIELDS = ("id", "lang", "question", "doc_id", "expected_pages")


@dataclass
class Result:
    question: dict
    hits: list[Hit]

    @property
    def pages(self) -> list[int]:
        return [hit.chunk["page"] for hit in self.hits]

    @property
    def first_hit_rank(self) -> int | None:
        """Rank (1-based) of the first chunk on an expected page, None if missed."""
        expected = set(self.question["expected_pages"])
        return next((rank for rank, page in enumerate(self.pages, start=1) if page in expected), None)


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


def hit_rate_by_lang(results: list[Result]) -> dict[str, tuple[int, int]]:
    """{"all": (hits, total), "<lang>": (hits, total), ...}"""
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for result in results:
        hit = result.first_hit_rank is not None
        for key in ("all", result.question["lang"]):
            counts[key][0] += hit
            counts[key][1] += 1
    return {key: (hits, total) for key, (hits, total) in counts.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate retrieval with hit@k.")
    parser.add_argument("questions", type=Path)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("-k", type=int, default=5)
    args = parser.parse_args()

    questions = load_questions(args.questions)
    embedder = Embedder(args.model)
    indexes: dict[str, Index] = {}
    results = []
    for question in questions:
        doc_id = question["doc_id"]
        if doc_id not in indexes:
            indexes[doc_id] = load_index(doc_id, args.model)
        results.append(Result(question, search(indexes[doc_id], embedder, question["question"], args.k)))

    print(f"model: {args.model}\n")
    print(f"id   lang  result  rank  expected        retrieved pages")
    for r in results:
        rank = r.first_hit_rank
        print(f"{r.question['id']:<4} {r.question['lang']:<5} {'HIT' if rank else 'MISS':<7} "
              f"{rank or '-':<5} {str(r.question['expected_pages']):<15} {r.pages}")

    print(f"\nhit@{args.k}")
    for key, (hits, total) in sorted(hit_rate_by_lang(results).items()):
        print(f"  {key:<4} {hits}/{total} ({100 * hits / total:.0f}%)")

    misses = [r for r in results if r.first_hit_rank is None]
    for r in misses:
        print(f"\nMISS {r.question['id']} ({r.question['lang']}): {r.question['question']}")
        for hit in r.hits:
            print(f"  {hit.rank}. {hit.score:.3f} p.{hit.chunk['page']:<4} {snippet(hit.chunk['text'], 160)}")


if __name__ == "__main__":
    main()
