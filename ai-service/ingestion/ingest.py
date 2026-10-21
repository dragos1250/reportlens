"""CLI: turn a PDF report into a JSONL file of chunks.

Usage (from ai-service/):
    python -m ingestion.ingest ../data/raw/vodafone-fy26.pdf --doc-id vodafone-fy26
"""

import argparse
import json
import time
from collections import Counter
from pathlib import Path

from .chunker import DEFAULT_MAX_CHARS, DEFAULT_OVERLAP_CHARS, chunk_page
from .pdf_reader import read_pdf

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = REPO_ROOT / "data" / "processed"
PROGRESS_EVERY = 25  # pages


def main() -> None:
    parser = argparse.ArgumentParser(description="Split a PDF report into chunks.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--doc-id", required=True)
    parser.add_argument("--out", type=Path, help="output .jsonl (default: data/processed/<doc-id>.chunks.jsonl)")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    parser.add_argument("--overlap", type=int, default=DEFAULT_OVERLAP_CHARS)
    parser.add_argument("--tables", action="store_true",
                        help="detect ruled tables and store them as separate chunks (off by default)")
    args = parser.parse_args()

    out = args.out or DEFAULT_OUT_DIR / f"{args.doc_id}.chunks.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)

    start = time.perf_counter()

    def report_progress(done: int, total: int) -> None:
        if done % PROGRESS_EVERY == 0 or done == total:
            print(f"read {done}/{total} pages ({time.perf_counter() - start:.0f}s)", flush=True)

    pages = read_pdf(args.pdf, detect_tables=args.tables, on_progress=report_progress)
    empty_pages = [p.number for p in pages if not p.text.strip() and not p.tables]
    kinds: Counter[str] = Counter()

    with out.open("w", encoding="utf-8") as f:
        for page in pages:
            for chunk in chunk_page(args.doc_id, page, args.max_chars, args.overlap):
                kinds[chunk.kind] += 1
                f.write(json.dumps(chunk.to_dict(), ensure_ascii=False) + "\n")

    print(f"pages:            {len(pages)}")
    print(f"tables detected:  {sum(len(p.tables) for p in pages)}")
    print(f"chunks:           {sum(kinds.values())} (text: {kinds['text']}, table: {kinds['table']})")
    print(f"pages without text: {len(empty_pages)} {empty_pages if empty_pages else ''}")
    print(f"time:             {time.perf_counter() - start:.1f}s")
    print(f"written to:       {out}")


if __name__ == "__main__":
    main()
