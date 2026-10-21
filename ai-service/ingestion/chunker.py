"""Split page text and tables into chunks.

Pure functions on plain text: no PDF library here, so the logic is easy to test.
"""

import re

from .models import Chunk, Page, Table

# Starting values, not measured yet. To be tuned against the embedding model
# (stage 3) and the evaluation set (stage 10).
DEFAULT_MAX_CHARS = 1000
DEFAULT_OVERLAP_CHARS = 150

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_PARAGRAPH_BREAK = re.compile(r"\n\s*\n")


def clean_paragraph(text: str) -> str:
    """Join words hyphenated across lines and collapse whitespace."""
    text = text.replace("­", "")  # soft hyphen
    text = re.sub(r"(\w)-\n(?=[a-z])", r"\1", text)  # "opera-\ntional" -> "operational"
    return re.sub(r"\s+", " ", text).strip()


def split_paragraphs(text: str) -> list[str]:
    paragraphs = (clean_paragraph(p) for p in _PARAGRAPH_BREAK.split(text))
    return [p for p in paragraphs if p]


def _tail(text: str, n: int) -> str:
    """Last ~n characters of text, starting at a word boundary."""
    if n <= 0:
        return ""
    if len(text) <= n:
        return text
    tail = text[-n:]
    space = tail.find(" ")
    return tail[space + 1:] if space != -1 else tail


def pack(pieces: list[str], max_chars: int, sep: str, overlap_chars: int = 0) -> list[str]:
    """Greedily join pieces into chunks of at most max_chars.

    When a chunk is full, the next one starts with the tail of the previous one
    (overlap), if it still fits. A single piece longer than max_chars is kept as is.
    """
    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if not current:
            current = piece
        elif len(current) + len(sep) + len(piece) <= max_chars:
            current += sep + piece
        else:
            chunks.append(current)
            tail = _tail(current, overlap_chars)
            if tail and len(tail) + len(sep) + len(piece) <= max_chars:
                current = tail + sep + piece
            else:
                current = piece
    if current:
        chunks.append(current)
    return chunks


def _fit_paragraph(paragraph: str, max_chars: int) -> list[str]:
    """Split a paragraph longer than max_chars at sentence, then word boundaries."""
    if len(paragraph) <= max_chars:
        return [paragraph]
    parts: list[str] = []
    for sentence in _SENTENCE_END.split(paragraph):
        if len(sentence) <= max_chars:
            parts.append(sentence)
        else:
            parts.extend(pack(sentence.split(" "), max_chars, " "))
    return pack(parts, max_chars, " ")


def split_text(text: str, max_chars: int = DEFAULT_MAX_CHARS,
               overlap_chars: int = DEFAULT_OVERLAP_CHARS) -> list[str]:
    pieces: list[str] = []
    for paragraph in split_paragraphs(text):
        pieces.extend(_fit_paragraph(paragraph, max_chars))
    return pack(pieces, max_chars, "\n\n", overlap_chars)


def _format_row(row: list[str | None]) -> str:
    cells = [clean_paragraph(cell or "").replace("|", "/") for cell in row]
    return "| " + " | ".join(cells) + " |"


def table_to_chunks(table: Table, max_chars: int = DEFAULT_MAX_CHARS) -> list[str]:
    """Render a table as Markdown-like rows, split by rows if too long.

    The first row is treated as the header and repeated in every chunk,
    so the numbers keep their column names.
    """
    rows = [row for row in table if any((cell or "").strip() for cell in row)]
    if not rows:
        return []
    header = _format_row(rows[0]) + "\n|" + "---|" * len(rows[0])
    body = [_format_row(row) for row in rows[1:]]
    if not body:
        return [header]
    room = max(max_chars - len(header) - 1, 1)
    return [header + "\n" + part for part in pack(body, room, "\n")]


def make_chunk_id(doc_id: str, page: int, chunk_index: int) -> str:
    return f"{doc_id}-p{page:04d}-c{chunk_index:03d}"


def chunk_page(doc_id: str, page: Page, max_chars: int = DEFAULT_MAX_CHARS,
               overlap_chars: int = DEFAULT_OVERLAP_CHARS) -> list[Chunk]:
    """Chunks for one page: text first, then one or more chunks per table.

    Chunks never cross page boundaries, so every citation points to one page.
    """
    texts = [("text", t) for t in split_text(page.text, max_chars, overlap_chars)]
    for table in page.tables:
        texts.extend(("table", t) for t in table_to_chunks(table, max_chars))
    return [
        Chunk(
            chunk_id=make_chunk_id(doc_id, page.number, index),
            doc_id=doc_id,
            page=page.number,
            chunk_index=index,
            kind=kind,
            text=text,
        )
        for index, (kind, text) in enumerate(texts)
    ]
