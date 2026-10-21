"""Evaluate answers: citations, refusals, status, cost, time.

Usage (from ai-service/):
    python -m generation.evaluate ../eval/retrieval_questions.jsonl ../eval/not_in_report_questions.jsonl \
        --model gpt-6-luna [--max-cost 0.50] [--min-score 0.75]

Questions with "answerable": false have no answer in the report (missing field = true).
For answerable questions it measures whether the answer cites an expected page; for
all questions it counts refusals (guard before the LLM, or the LLM's "not_found").
It does not judge whether an answer is correct: full answers are printed for a manual check.
"""

import argparse
import json
import statistics
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from retrieval.reranker import DEFAULT_RERANKER
from retrieval.search import METHODS, Searcher
from storage.factory import DEFAULT_STORE, STORES

from .answer import DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_METHOD, Answer, answer_question
from .ask import build_searcher, format_cost
from .guard import DEFAULT_MIN_SCORE
from .llm import LLMClient, client_from_env

RUNS_DIR = Path(__file__).resolve().parents[2] / "data" / "eval-runs"
DEFAULT_MAX_COST_USD = 0.50
REFUSAL_STATUSES = {"not_in_report", "not_found"}  # guard, LLM


def load_questions(path: Path) -> list[dict]:
    """Like the retrieval questions, plus "answerable" (default true).
    Unanswerable questions need no expected_pages."""
    questions = []
    with path.open(encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            if not line.strip():
                continue
            question = json.loads(line)
            question.setdefault("answerable", True)
            required = ["id", "lang", "question", "doc_id"] + (["expected_pages"] if question["answerable"] else [])
            missing = [name for name in required if name not in question]
            if missing:
                raise ValueError(f"{path.name}:{line_number}: missing {', '.join(missing)}")
            question.setdefault("expected_pages", [])
            questions.append(question)
    return questions


@dataclass
class Graded:
    question: dict
    answer: Answer

    @property
    def answerable(self) -> bool:
        return self.question.get("answerable", True)

    @property
    def refused(self) -> bool:
        return self.answer.status in REFUSAL_STATUSES

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
        max_output_tokens: int, max_cost: float, translate: bool = False,
        min_score: float = DEFAULT_MIN_SCORE) -> tuple[list[Graded], bool]:
    """Answer each question; stop before the next one once spending reaches max_cost.

    With translate=True, non-English questions (by their "lang" field) are
    searched with an English translation.
    """
    graded: list[Graded] = []
    spent = 0.0
    for question in questions:
        if spent >= max_cost:
            return graded, True
        answer = answer_question(question["question"], searcher_for(question["doc_id"]), llm,
                                 method, max_output_tokens=max_output_tokens,
                                 lang=question["lang"], translate=translate, min_score=min_score)
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


def refusal_counts(graded: list[Graded]) -> dict[str, dict[str, int]]:
    """Refusals by group: correct ones among unanswerable questions, wrong ones among
    answerable questions, each split by layer (guard / LLM)."""
    result = {}
    for group, answerable in (("unanswerable", False), ("answerable", True)):
        members = [g for g in graded if g.answerable == answerable]
        statuses = Counter(g.answer.status for g in members)
        result[group] = {
            "total": len(members),
            "refused": sum(g.refused for g in members),
            "by_guard": statuses["not_in_report"],
            "by_llm": statuses["not_found"],
        }
    return result


def describe_scores(scores: list[float]) -> str:
    if not scores:
        return "-"
    return f"min {min(scores):.3f}, median {statistics.median(scores):.3f}, max {max(scores):.3f}"


def save_run(graded: list[Graded], model: str, suffix: str = "") -> Path:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNS_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{model}{suffix}.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for g in graded:
            a, r = g.answer, g.answer.response
            f.write(json.dumps({
                "id": g.question["id"], "lang": g.question["lang"], "question": g.question["question"],
                "answerable": g.answerable, "best_score": a.best_score,
                "search_query": a.search_query, "translation_cost_usd": a.translation_cost_usd,
                "expected_pages": g.question["expected_pages"], "status": a.status,
                "answer": a.rendered, "cited_pages": a.check.pages, "invalid": a.check.invalid,
                "problems": a.problems, "sent_pages": [c["page"] for c in a.passages.values()],
                "input_tokens": r.input_tokens if r else 0, "output_tokens": r.output_tokens if r else 0,
                "reasoning_tokens": r.reasoning_tokens if r else 0, "cost_usd": a.cost_usd,
                "llm_seconds": round(a.llm_seconds, 2),
            }, ensure_ascii=False) + "\n")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate answers with citations and refusals.")
    parser.add_argument("questions", type=Path, nargs="+")
    parser.add_argument("--model", help="overrides LLM_MODEL from .env")
    parser.add_argument("--method", choices=METHODS, default=DEFAULT_METHOD)
    parser.add_argument("--reranker", default=DEFAULT_RERANKER)
    parser.add_argument("--max-output-tokens", type=int, default=DEFAULT_MAX_OUTPUT_TOKENS)
    parser.add_argument("--max-cost", type=float, default=DEFAULT_MAX_COST_USD, help="USD for the whole run")
    parser.add_argument("--translate-query", action="store_true",
                        help="search non-English questions with an English translation (off by default)")
    parser.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE,
                        help=f"guard threshold (default {DEFAULT_MIN_SCORE}; -1 turns the guard off)")
    parser.add_argument("--store", choices=STORES, default=DEFAULT_STORE,
                        help="where the chunk vectors are searched (default postgres)")
    args = parser.parse_args()

    questions = [q for path in args.questions for q in load_questions(path)]
    llm = client_from_env(args.model)
    searchers: dict[str, Searcher] = {}

    def searcher_for(doc_id: str) -> Searcher:
        if doc_id not in searchers:
            searchers[doc_id] = build_searcher(doc_id, args.method, args.reranker, args.store)
        return searchers[doc_id]

    graded, stopped = run(questions, searcher_for, llm, args.method, args.max_output_tokens, args.max_cost,
                          translate=args.translate_query, min_score=args.min_score)

    print(f"model: {llm.model} | retrieval: {args.method} | max_output_tokens: {args.max_output_tokens} "
          f"| translate query: {'on' if args.translate_query else 'off'} | guard min score: {args.min_score} "
          f"| store: {args.store}\n")
    for g in graded:
        a, r = g.answer, g.answer.response
        print(f"=== {g.question['id']} ({g.question['lang']}, {'answerable' if g.answerable else 'NOT answerable'}) "
              f"{g.question['question']}")
        if a.translation is not None:
            print(f"search query (translated): {a.search_query}")
        print(f"best score {a.best_score:.3f} | expected pages {g.question['expected_pages']} | "
              f"sent {[c['page'] for c in a.passages.values()]} | cited {a.check.pages} | status {a.status}"
              f"{' | CITES EXPECTED PAGE' if g.cites_expected_page else ''}")
        print(a.rendered)
        for problem in a.problems:
            print(f"WARNING: {problem}")
        if r is None:
            print(f"refused by the guard, no LLM call | cost {format_cost(a)}\n")
        else:
            print(f"tokens in {r.input_tokens}, out {r.output_tokens} (reasoning {r.reasoning_tokens}) | "
                  f"cost {format_cost(a)} | LLM {a.llm_seconds:.2f}s, retrieval {a.retrieval_seconds:.2f}s\n")

    if stopped:
        print(f"STOPPED: budget of ${args.max_cost:.2f} reached after {len(graded)} questions\n")

    answerable = [g for g in graded if g.answerable]
    unanswerable = [g for g in graded if not g.answerable]
    print("summary")
    if answerable:
        print(f"  answerable questions: {len(answerable)}")
        for label, predicate in [("cites an expected page", lambda g: g.cites_expected_page),
                                 ("expected page among passages sent", lambda g: g.expected_page_was_sent)]:
            counts = count_by_lang(answerable, predicate)
            print(f"    {label:<36}" + "  ".join(f"{k} {n}/{t}" for k, (n, t) in sorted(counts.items())))
    refusals = refusal_counts(graded)
    for group, label in (("unanswerable", "correct refusals (unanswerable)"),
                         ("answerable", "wrong refusals (answerable)")):
        c = refusals[group]
        if c["total"]:
            print(f"  {label:<36}{c['refused']}/{c['total']} (guard {c['by_guard']}, LLM {c['by_llm']})")
    answered_unanswerable = [g.question["id"] for g in unanswerable if not g.refused]
    if answered_unanswerable:
        print(f"  unanswerable but answered (check by hand): {', '.join(answered_unanswerable)}")
    print("  best chunk score (reported only, not used to tune the threshold):")
    for label, group in (("answerable", answerable), ("unanswerable", unanswerable)):
        scores = [g.answer.best_score for g in group]
        below = sum(s < args.min_score for s in scores)
        print(f"    {label:<14}{describe_scores(scores)} | below {args.min_score}: {below}/{len(scores)}")
    statuses = Counter(g.answer.status for g in graded)
    print(f"  status: {dict(statuses)} (incomplete: {statuses.get('incomplete', 0)})")
    print(f"  invalid citations: {sum(len(g.answer.check.invalid) for g in graded)}")
    costs = [g.answer.cost_usd for g in graded if g.answer.cost_usd is not None]
    translated = [g.answer for g in graded if g.answer.translation is not None]
    translation_cost = sum(a.translation_cost_usd or 0.0 for a in translated)
    print(f"  LLM answer calls: {sum(g.answer.response is not None for g in graded)} of {len(graded)}")
    print(f"  translation calls: {len(translated)}, cost ${translation_cost:.6f}")
    print(f"  total cost: ${sum(costs):.6f} for {len(graded)} questions (translation included)")
    total_times = [g.answer.llm_seconds + g.answer.retrieval_seconds for g in graded]
    print(f"  total time per question: median {statistics.median(total_times):.2f}s, max {max(total_times):.2f}s")
    print(f"  saved to {save_run(graded, llm.model, '-translated' if args.translate_query else '')}")


if __name__ == "__main__":
    main()
