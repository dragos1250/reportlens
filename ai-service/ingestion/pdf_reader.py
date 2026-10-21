"""Read a PDF page by page. The only module that depends on pdfplumber."""

from collections.abc import Callable
from pathlib import Path

import pdfplumber

from .models import Page

# A vertical gap larger than this fraction of the line height starts a new
# paragraph. Starting value, to be checked on real reports.
PARAGRAPH_GAP_FACTOR = 0.6

BBox = tuple[float, float, float, float]  # x0, top, x1, bottom


def _inside(obj: dict, bbox: BBox) -> bool:
    """True if the centre of a PDF object lies inside bbox."""
    x = (obj["x0"] + obj["x1"]) / 2
    y = (obj["top"] + obj["bottom"]) / 2
    x0, top, x1, bottom = bbox
    return x0 <= x <= x1 and top <= y <= bottom


def lines_to_text(lines: list[dict]) -> str:
    """Join text lines into paragraphs separated by a blank line.

    A new paragraph starts after a large vertical gap, or when the next line is
    higher on the page than the previous one (the text flow moved to a new column).
    """
    paragraphs: list[list[str]] = []
    previous = None
    for line in lines:
        if previous is None:
            paragraphs.append([])
        else:
            height = previous["bottom"] - previous["top"]
            gap = line["top"] - previous["bottom"]
            if gap > PARAGRAPH_GAP_FACTOR * height or line["top"] < previous["top"]:
                paragraphs.append([])
        paragraphs[-1].append(line["text"])
        previous = line
    return "\n\n".join("\n".join(p) for p in paragraphs)


def read_pdf(path: Path, detect_tables: bool = False,
             on_progress: Callable[[int, int], None] | None = None) -> list[Page]:
    """Extract every page. on_progress(done, total) is called after each page.

    Table detection is off by default: on reports without ruled tables it mostly
    finds layout boxes and drops their text (see NOTES.md). Without it, table rows
    stay in the running text with their labels and numbers.
    """
    pages: list[Page] = []
    with pdfplumber.open(path) as pdf:
        total = len(pdf.pages)
        for number, page in enumerate(pdf.pages, start=1):
            tables = page.find_tables() if detect_tables else []
            bboxes = [t.bbox for t in tables]
            # Remove table areas from the running text so numbers are not stored twice.
            text_page = page.filter(lambda obj: not any(_inside(obj, b) for b in bboxes)) if bboxes else page
            lines = text_page.extract_text_lines(use_text_flow=True)
            pages.append(Page(
                number=number,
                text=lines_to_text(lines),
                tables=[t.extract() for t in tables],
            ))
            page.close()  # free cached objects, reports can have hundreds of pages
            if on_progress:
                on_progress(number, total)
    return pages
