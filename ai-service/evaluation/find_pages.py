"""CLI: candidate pages for a question's ground truth, by exact text search in the PDF.

Usage (from ai-service/):
    python -m evaluation.find_pages "undrawn committed" --doc vodafone-20f-fy26
    python -m evaluation.find_pages "net debt" "31 December 2025" --doc dtag-ar-2025   # all terms on one page

Independent of the system under evaluation: no chunks, no embeddings, no LLM, only the
text pdfplumber reads from each page. Matching ignores case and collapses whitespace
(line breaks inside a phrase still match). Page numbers are physical PDF pages
(1 = first page of the file), as in eval/README.md. A human confirms each page in the PDF.

The page texts are cached in data/eval-cache/ (git-ignored), so later searches are instant.
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"
CACHE_DIR = REPO_ROOT / "data" / "eval-cache"
CONTEXT_CHARS = 90
MAX_SNIPPETS_PER_PAGE = 2


def normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def page_texts(doc_id: str) -> list[str]:
    """Text of every page, from the cache or read once with pdfplumber."""
    cache = CACHE_DIR / f"{doc_id}.pages.json"
    pdf_path = RAW_DIR / f"{doc_id}.pdf"
    if cache.exists() and cache.stat().st_mtime >= pdf_path.stat().st_mtime:
        return json.loads(cache.read_text(encoding="utf-8"))
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        texts = [page.extract_text() or "" for page in pdf.pages]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(texts), encoding="utf-8")
    return texts


def find(texts: list[str], terms: list[str]) -> list[dict]:
    """Pages (1-based) whose text contains every term, with short snippets around the first term."""
    needles = [normalise(t) for t in terms]
    results = []
    for number, raw in enumerate(texts, start=1):
        text = normalise(raw)
        if not text or not all(n in text for n in needles):
            continue
        first = needles[0]
        snippets, start = [], 0
        while len(snippets) < MAX_SNIPPETS_PER_PAGE and (at := text.find(first, start)) != -1:
            snippets.append(text[max(0, at - CONTEXT_CHARS): at + len(first) + CONTEXT_CHARS])
            start = at + len(first)
        results.append({"page": number, "count": text.count(first), "snippets": snippets})
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Exact text search in a report PDF, page by page.")
    parser.add_argument("terms", nargs="+", help="all terms must appear on the same page")
    parser.add_argument("--doc", required=True, help="doc_id, as in scripts/reports.json")
    args = parser.parse_args()

    texts = page_texts(args.doc)
    results = find(texts, args.terms)
    empty = sum(1 for t in texts if not t.strip())
    print(f"{args.doc}: {len(texts)} pages ({empty} without text, never matched); "
          f"terms {args.terms}: {len(results)} page(s)")
    for r in results:
        print(f"\np. {r['page']}  ({r['count']}x)")
        for s in r["snippets"]:
            print(f"   ...{s}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
