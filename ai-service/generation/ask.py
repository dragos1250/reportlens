"""CLI: answer one question about a report, with citations.

Usage (from ai-service/):
    python -m generation.ask "Care au fost veniturile totale în FY26?" --doc-id vodafone-20f-fy26
    [--method hybrid+rerank --reranker BAAI/bge-reranker-v2-m3] [--model gpt-6.1-sol]
"""

import argparse

from retrieval.embedder import DEFAULT_MODEL as DEFAULT_EMBEDDING_MODEL
from retrieval.embedder import Embedder
from retrieval.index import load_index
from retrieval.reranker import DEFAULT_RERANKER, Reranker
from retrieval.search import METHODS, Searcher, snippet

from .answer import DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_METHOD, MAX_PASSAGES, Answer, answer_question
from .llm import client_from_env


def build_searcher(doc_id: str, method: str, reranker_name: str) -> Searcher:
    reranker = Reranker(reranker_name) if method == "hybrid+rerank" else None
    index = load_index(doc_id, DEFAULT_EMBEDDING_MODEL)
    return Searcher(index, Embedder(DEFAULT_EMBEDDING_MODEL), reranker)


def format_cost(answer: Answer) -> str:
    cost = answer.cost_usd
    return "unknown (model not in price table)" if cost is None else f"${cost:.6f}"


def print_answer(answer: Answer) -> None:
    r = answer.response
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
    args = parser.parse_args()

    searcher = build_searcher(args.doc_id, args.method, args.reranker)
    llm = client_from_env(args.model)
    answer = answer_question(args.question, searcher, llm, args.method, args.passages, args.max_output_tokens)
    print_answer(answer)


if __name__ == "__main__":
    main()
