"""Remove repeated page headers and footers.

Pure functions on page text: lines separated by "\n", paragraphs by a blank line.
"""

import re
from collections import Counter

# A line counts as a header/footer if its normalised form is the first or last
# line on at least this many pages. Conservative: real text rarely repeats this often.
DEFAULT_EDGE_MIN_PAGES = 20
# Upper bound on peeling passes (page number, then header bar, ...).
DEFAULT_EDGE_MAX_PASSES = 3

# pdfplumber writes "(cid:N)" for glyphs with no Unicode mapping (e.g. decorative icons).
UNMAPPED_GLYPH = re.compile(r"\(cid:\d+\)")


def normalize_line(line: str) -> str:
    """Key used to compare lines across pages: page numbers and years become '#'."""
    return re.sub(r"\d+", "#", " ".join(line.split()))


def _edge_indexes(lines: list[str]) -> set[int]:
    """Indexes of the first and last line that hold real text (not only glyph markers)."""
    content = [i for i, line in enumerate(lines) if UNMAPPED_GLYPH.sub("", line).strip()]
    return {content[0], content[-1]} if content else set()


def remove_repeated_edge_lines(page_texts: list[str],
                               min_pages: int = DEFAULT_EDGE_MIN_PAGES,
                               max_passes: int = DEFAULT_EDGE_MAX_PASSES) -> tuple[list[str], int]:
    """Peel repeated lines off the top and bottom of pages.

    Each pass removes the first/last line of a page when it repeats at the edge
    of many pages. Removing a page number can expose a header bar below it, so
    passes repeat until nothing is removed (at most max_passes). A line is only
    removed once it is at the edge, so the peeling stops at the first ordinary
    line. Returns the cleaned texts and how many lines were removed.
    """
    removed_total = 0
    for _ in range(max_passes):
        page_texts, removed = _remove_edge_pass(page_texts, min_pages)
        removed_total += removed
        if removed == 0:
            break
    return page_texts, removed_total


def _remove_edge_pass(page_texts: list[str], min_pages: int) -> tuple[list[str], int]:
    """One pass: drop the current first/last line where it repeats on min_pages pages."""
    pages_lines = [text.split("\n") for text in page_texts]

    edge_counts: Counter[str] = Counter()
    for lines in pages_lines:
        # A set, so a one-line page is counted once.
        edge_counts.update({normalize_line(lines[i]) for i in _edge_indexes(lines)})
    repeated = {key for key, n in edge_counts.items() if n >= min_pages}

    cleaned: list[str] = []
    removed = 0
    for lines in pages_lines:
        drop = {i for i in _edge_indexes(lines) if normalize_line(lines[i]) in repeated}
        removed += len(drop)
        cleaned.append("\n".join(line for i, line in enumerate(lines) if i not in drop))
    return cleaned, removed
