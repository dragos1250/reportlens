"""Evaluate answers on the retrieval questions: citations, status, cost, time.

Usage (from ai-service/):
    python -m generation.evaluate ../eval/retrieval_questions.jsonl --model gpt-6-luna [--max-cost 0.50]

Measures whether the answer cites an expected page, not whether the answer is
correct: the full answers are printed for a manual check.
"""

import argparse
import json
import statistics
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from retrieval.evaluate import load_questions
from retrieval.reranker import DEFAULT_RERANKER
from retrieval.search import METHODS, Searcher

from .answer import DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_METHOD, Answer, answer_question
from .ask import build_searcher, format_cost
from .llm import LLMClient, client_from_env

RUNS_DIR = Path(__file__).resolve().parents[2] / "data" / "eval-runs"
DEFAULT_MAX_COST_USD = 0.50


@dataclass
class Graded:
    question: dict
    answer: Answer

    @property
    def expected(self) -> set[int]:
        return set(self.question["expected_pages"])

    @property
    def cites_expected_page(self) -> bool:
        return bool(self.expected & set(self.answer.check.pages))

    @property
    def expected_page_was_sent(self) -> bool:
        """Upper bound: the model can only cite pages it received."""
        return any(chunk["page"] in self.expected for chunk in self.answer.passages.values())


def run(questions: list[dict], searcher_for: Callable[[str], Searcher], llm: LLMClient, method: str,
        max_output_tokens: int, max_cost: float) -> tuple[list[Graded], bool]:
    """Answer each question; stop before the next one once spending reaches max_cost."""
    graded: list[Graded] = []
    spent = 0.0
    for question in questions:
        if spent >= max_cost:
            return graded, True
        answer = answer_question(question["question"], searcher_for(question["doc_id"]), llm,
                                 method, max_output_tokens=max_output_tokens)
        spent += answer.cost_usd or 0.0
        graded.append(Graded(question, answer))
    return graded, False


def count_by_lang(graded: list[Graded], predicate: Callable[[Graded], bool]) -> dict[str, tuple[int, int]]:
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for g in graded:
        for key in ("all", g.question["lang"]):
            counts[key][0] += predicate(g)
            counts[key][1] += 1
    return {key: (n, total) for key, (n, total) in counts.items()}


def save_run(graded: list[Graded], model: str) -> Path:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNS_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{model}.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for g in graded:
            a, r = g.answer, g.answer.response
            f.write(json.dumps({
                "id": g.question["id"], "lang": g.question["lang"], "question": g.question["question"],
                "expected_pages": g.question["expected_pages"], "status": a.status,
                "answer": a.rendered, "cited_pages": a.check.pages, "invalid": a.check.invalid,
                "problems": a.problems, "sent_pages": [c["page"] for c in a.passages.values()],
                "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
                "reasoning_tokens": r.reasoning_tokens, "cost_usd": a.cost_usd,
                "llm_seconds": round(a.llm_seconds, 2),
            }, ensure_ascii=False) + "\n")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate answers with citations.")
    parser.add_argument("questions", type=Path)
    parser.add_argument("--model", help="overrides LLM_MODEL from .env")
    parser.add_argument("--method", choices=METHODS, default=DEFAULT_METHOD)
    parser.add_argument("--reranker", default=DEFAULT_RERANKER)
    parser.add_argument("--max-output-tokens", type=int, default=DEFAULT_MAX_OUTPUT_TOKENS)
    parser.add_argument("--max-cost", type=float, default=DEFAULT_MAX_COST_USD, help="USD for the whole run")
    args = parser.parse_args()

    questions = load_questions(args.questions)
    llm = client_from_env(args.model)
    searchers: dict[str, Searcher] = {}

    def searcher_for(doc_id: str) -> Searcher:
        if doc_id not in searchers:
            searchers[doc_id] = build_searcher(doc_id, args.method, args.reranker)
        return searchers[doc_id]

    graded, stopped = run(questions, searcher_for, llm, args.method, args.max_output_tokens, args.max_cost)

    print(f"model: {llm.model} | retrieval: {args.method} | max_output_tokens: {args.max_output_tokens}\n")
    for g in graded:
        a, r = g.answer, g.answer.response
        print(f"=== {g.question['id']} ({g.question['lang']}) {g.question['question']}")
        print(f"expected pages {g.question['expected_pages']} | sent {[c['page'] for c in a.passages.values()]} "
              f"| cited {a.check.pages} | status {a.status}"
              f"{' | CITES EXPECTED PAGE' if g.cites_expected_page else ''}")
        print(a.rendered)
        for problem in a.problems:
            print(f"WARNING: {problem}")
        print(f"tokens in {r.input_tokens}, out {r.output_tokens} (reasoning {r.reasoning_tokens}) | "
              f"cost {format_cost(a)} | LLM {a.llm_seconds:.2f}s, retrieval {a.retrieval_seconds:.2f}s\n")

    if stopped:
        print(f"STOPPED: budget of ${args.max_cost:.2f} reached after {len(graded)} questions\n")

    print("summary")
    for label, predicate in [("cites an expected page", lambda g: g.cites_expected_page),
                             ("expected page among passages sent", lambda g: g.expected_page_was_sent)]:
        counts = count_by_lang(graded, predicate)
        print(f"  {label:<36}" + "  ".join(f"{k} {n}/{t}" for k, (n, t) in sorted(counts.items())))
    statuses = Counter(g.answer.status for g in graded)
    print(f"  status: {dict(statuses)} (incomplete: {statuses.get('incomplete', 0)})")
    print(f"  invalid citations: {sum(len(g.answer.check.invalid) for g in graded)}")
    costs = [g.answer.cost_usd for g in graded if g.answer.cost_usd is not None]
    print(f"  total cost: ${sum(costs):.6f} for {len(graded)} questions")
    llm_times = [g.answer.llm_seconds for g in graded]
    total_times = [g.answer.llm_seconds + g.answer.retrieval_seconds for g in graded]
    print(f"  LLM time per question: median {statistics.median(llm_times):.2f}s, max {max(llm_times):.2f}s")
    print(f"  total time per question: median {statistics.median(total_times):.2f}s, max {max(total_times):.2f}s")
    print(f"  saved to {save_run(graded, llm.model)}")


if __name__ == "__main__":
    main()
