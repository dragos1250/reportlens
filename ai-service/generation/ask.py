"""CLI: answer one question about a report, with citations.

Usage (from ai-service/):
    python -m generation.ask "Care au fost veniturile totale în FY26?" --doc-id vodafone-20f-fy26
    [--method hybrid+rerank --reranker BAAI/bge-reranker-v2-m3] [--model gpt-6.1-sol]
    [--lang ro --translate-query]
"""

import argparse

from retrieval.embedder import DEFAULT_MODEL as DEFAULT_EMBEDDING_MODEL
from retrieval.embedder import Embedder
from retrieval.index import load_index
from retrieval.reranker import DEFAULT_RERANKER, Reranker
from retrieval.search import METHODS, Searcher, snippet

from .answer import DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_METHOD, MAX_PASSAGES, Answer, answer_question
from .llm import client_from_env
from .translate import SEARCH_LANGUAGE


def build_searcher(doc_id: str, method: str, reranker_name: str) -> Searcher:
    reranker = Reranker(reranker_name) if method == "hybrid+rerank" else None
    index = load_index(doc_id, DEFAULT_EMBEDDING_MODEL)
    return Searcher(index, Embedder(DEFAULT_EMBEDDING_MODEL), reranker)


def format_usd(cost: float | None) -> str:
    return "unknown (model not in price table)" if cost is None else f"${cost:.6f}"


def format_cost(answer: Answer) -> str:
    if answer.translation is None:
        return format_usd(answer.cost_usd)
    return f"{format_usd(answer.cost_usd)} (translation {format_usd(answer.translation_cost_usd)})"


def print_answer(answer: Answer) -> None:
    r = answer.response
    print(f"question: {answer.question}")
    if answer.translation is not None:
        print(f"search query (translated): {answer.search_query}")
    print(f"status: {answer.status}")
    print(f"\n{answer.rendered}\n")
    cited = {c.marker for c in answer.check.citations}
    print("passages sent (* = cited):")
    for marker, chunk in answer.passages.items():
        flag = "*" if marker in cited else " "
        print(f" {flag} {marker}  {chunk['doc_id']} p.{chunk['page']:<4} {snippet(chunk['text'], 110)}")
    for problem in answer.problems:
        print(f"WARNING: {problem}")
    print(f"\nmodel: {r.model} | tokens in {r.input_tokens}, out {r.output_tokens} "
          f"(reasoning {r.reasoning_tokens}) | cost {format_cost(answer)} | "
          f"time: retrieval {answer.retrieval_seconds:.2f}s, LLM {answer.llm_seconds:.2f}s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Answer a question about a report, with citations.")
    parser.add_argument("question")
    parser.add_argument("--doc-id", required=True)
    parser.add_argument("--method", choices=METHODS, default=DEFAULT_METHOD)
    parser.add_argument("--reranker", default=DEFAULT_RERANKER)
    parser.add_argument("--model", help="overrides LLM_MODEL from .env")
    parser.add_argument("--passages", type=int, default=MAX_PASSAGES)
    parser.add_argument("--max-output-tokens", type=int, default=DEFAULT_MAX_OUTPUT_TOKENS)
    parser.add_argument("--lang", default=SEARCH_LANGUAGE, help="language of the question, e.g. ro (default en)")
    parser.add_argument("--translate-query", action="store_true",
                        help="search with an English translation of a non-English question (off by default)")
    args = parser.parse_args()

    searcher = build_searcher(args.doc_id, args.method, args.reranker)
    llm = client_from_env(args.model)
    answer = answer_question(args.question, searcher, llm, args.method, args.passages, args.max_output_tokens,
                             lang=args.lang, translate=args.translate_query)
    print_answer(answer)


if __name__ == "__main__":
    main()
