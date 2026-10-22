"""Ingest one uploaded PDF: the same steps as the built-in reports (read, clean, chunk,
embed, load), reporting progress, with the upload checks in between."""

import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ingestion.chunker import chunk_page
from ingestion.cleaner import remove_repeated_edge_lines
from ingestion.pdf_reader import read_pdf
from retrieval.embedder import DEFAULT_MODEL
from retrieval.index import Index, file_sha256, index_paths, save_index

from .checks import UploadRejected, check_pages, check_text_layer, count_pages
from .limits import UploadLimits

EMBED_BATCH = 64  # chunks per progress step while indexing

# state, step label (as in docs/DESIGN.md), done, total
Progress = Callable[[str, str, int, int], None]


@dataclass
class Ingested:
    pages: int
    pages_without_text: int
    chunks: int


def ingest(doc_id: str, title: str, pdf_path: Path, limits: UploadLimits, progress: Progress,
           make_embedder: Callable[[], object], load: Callable[..., int], processed_dir: Path | None = None,
           model: str = DEFAULT_MODEL, read: Callable = read_pdf,
           pages_in: Callable[[Path], int] = count_pages) -> Ingested:
    """load(doc_id=, title=, index=, chunks_sha=, model=, pages=, pages_without_text=) writes the
    document in one transaction; nothing is visible before it. Raises UploadRejected.

    Cheap checks first, heavy work after: the page count is read before any text, and the
    embedding model (seconds to load, hundreds of MB) is created only once every check has
    passed, by make_embedder."""
    progress("reading", "Checking the file", 0, 0)
    total = pages_in(pdf_path)
    check_pages(total, limits.max_pages)  # before any text is extracted

    pages = read(pdf_path, on_progress=lambda done, n: progress("reading", f"Reading {n} pages", done, n))
    with_text = sum(1 for p in pages if p.text.strip())
    check_text_layer(with_text, len(pages), limits.min_text_share)

    progress("indexing", "Splitting into passages", 0, 0)
    texts, _ = remove_repeated_edge_lines([p.text for p in pages])
    for page, text in zip(pages, texts):
        page.text = text
    chunks = [c.to_dict() for page in pages for c in chunk_page(doc_id, page)]
    if not chunks:
        raise UploadRejected("No text could be read from this PDF.")
    paths = index_paths(doc_id, model) if processed_dir is None else index_paths(doc_id, model, processed_dir)
    paths.chunks.parent.mkdir(parents=True, exist_ok=True)
    paths.chunks.write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in chunks), encoding="utf-8")

    import numpy as np
    embedder = make_embedder()
    parts = []
    for start in range(0, len(chunks), EMBED_BATCH):
        batch = chunks[start:start + EMBED_BATCH]
        parts.append(embedder.embed_passages([c["text"] for c in batch]))
        progress("indexing", "Indexing", start + len(batch), len(chunks))
    vectors = np.vstack(parts)
    save_index(paths, vectors, model)

    progress("indexing", "Preparing your workspace", len(chunks), len(chunks))
    load(doc_id=doc_id, title=title, index=Index(chunks=chunks, vectors=vectors, model_name=model),
         chunks_sha=file_sha256(paths.chunks), model=model, pages=len(pages),
         pages_without_text=len(pages) - with_text)
    return Ingested(pages=len(pages), pages_without_text=len(pages) - with_text, chunks=len(chunks))
