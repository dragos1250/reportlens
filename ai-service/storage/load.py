"""CLI: load a document's chunks and vectors from data/processed/ into PostgreSQL.

Usage (from ai-service/, database port published: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db):
    python -m storage.load --doc-id vodafone-20f-fy26 [--model intfloat/multilingual-e5-small]

Reloading replaces that document's rows (and only those) in one transaction.
"""

import argparse
import json
import time
from pathlib import Path

from retrieval.embedder import DEFAULT_MODEL
from retrieval.index import file_sha256, index_paths, load_index

from .db import apply_schema, connect

MANIFEST = Path(__file__).resolve().parents[2] / "scripts" / "reports.json"


def manifest_entry(doc_id: str) -> dict:
    for report in json.loads(MANIFEST.read_text(encoding="utf-8")):
        if report["doc_id"] == doc_id:
            return report
    return {"doc_id": doc_id}


def load_document(conn, doc_id: str, title: str, index, chunks_sha: str, model: str, source_url: str | None = None,
                  source: str = "builtin", pages: int | None = None, pages_without_text: int | None = None,
                  expires_at=None) -> int:
    """Replace one document's rows (document, chunks, vectors) in a single transaction, so a
    reader sees the old version or the new one, never half of it. Returns the vector count."""
    with conn.transaction():
        conn.execute("DELETE FROM rag.documents WHERE doc_id = %s", (doc_id,))  # cascades
        conn.execute(
            "INSERT INTO rag.documents (doc_id, title, source_url, chunks_sha256, source, pages, "
            "pages_without_text, expires_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (doc_id, title, source_url, chunks_sha, source, pages, pages_without_text, expires_at),
        )
        # COPY streams all rows in one command; row-by-row INSERTs took ~130 s here.
        with conn.cursor() as cur:
            with cur.copy("COPY rag.chunks (doc_id, position, chunk_id, page, chunk_index, kind, text) "
                          "FROM STDIN") as copy:
                for i, c in enumerate(index.chunks):
                    copy.write_row((doc_id, i, c["chunk_id"], c["page"], c["chunk_index"], c["kind"], c["text"]))
            with cur.copy("COPY rag.chunk_embeddings (doc_id, position, model, embedding) FROM STDIN") as copy:
                for i, vector in enumerate(index.vectors):
                    copy.write_row((doc_id, i, model, vector))
    return conn.execute("SELECT count(*) FROM rag.chunk_embeddings WHERE doc_id = %s AND model = %s",
                        (doc_id, model)).fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Load chunks and vectors into PostgreSQL.")
    parser.add_argument("--doc-id", required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    index = load_index(args.doc_id, args.model)  # fails if the vectors are missing or stale
    report = manifest_entry(args.doc_id)
    chunks_sha = file_sha256(index_paths(args.doc_id, args.model).chunks)

    start = time.perf_counter()
    conn = connect()
    apply_schema(conn)
    count = load_document(conn, args.doc_id, report.get("title", args.doc_id), index, chunks_sha, args.model,
                          source_url=report.get("source_page"))
    print(f"loaded {args.doc_id}: {len(index.chunks)} chunks, {count} vectors ({args.model}) "
          f"in {time.perf_counter() - start:.1f}s")


if __name__ == "__main__":
    main()
