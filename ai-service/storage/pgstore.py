"""Chunks and vector search in PostgreSQL + pgvector.

The vector search runs in the database: the query vector is sent, and pgvector
computes the inner product with every chunk vector of the document (exact scan,
no approximate index). Vectors are normalised, so inner product = cosine similarity,
the same score the numpy search computes. BM25 stays in memory (retrieval/bm25.py).
"""

import numpy as np

from retrieval.index import Index


class PgVectorStore:
    def __init__(self, conn, doc_id: str, model: str):
        self.conn = conn
        self.doc_id = doc_id
        self.model = model

    def top_k(self, query_vector: np.ndarray, k: int) -> list[tuple[int, float]]:
        """(row, score) of the k most similar chunks, best first; row = position in the chunks file."""
        # <#> is pgvector's negative inner product: smaller = more similar.
        # Ties are broken by position, like the stable sort of the numpy search.
        rows = self.conn.execute(
            """
            SELECT position, -(embedding <#> %(q)s) AS score
            FROM rag.chunk_embeddings
            WHERE doc_id = %(doc_id)s AND model = %(model)s
            ORDER BY embedding <#> %(q)s, position
            LIMIT %(k)s
            """,
            {"q": query_vector.astype(np.float32), "doc_id": self.doc_id, "model": self.model, "k": k},
        ).fetchall()
        return [(int(position), float(score)) for position, score in rows]

    def best_score(self, query_vector: np.ndarray) -> float:
        row = self.conn.execute(
            """
            SELECT max(-(embedding <#> %(q)s))
            FROM rag.chunk_embeddings
            WHERE doc_id = %(doc_id)s AND model = %(model)s
            """,
            {"q": query_vector.astype(np.float32), "doc_id": self.doc_id, "model": self.model},
        ).fetchone()
        return float(row[0])


def list_documents(conn) -> list[dict]:
    rows = conn.execute(
        """
        SELECT d.doc_id, d.title, count(c.position)
        FROM rag.documents d LEFT JOIN rag.chunks c USING (doc_id)
        GROUP BY d.doc_id, d.title ORDER BY d.doc_id
        """
    ).fetchall()
    return [{"doc_id": doc_id, "title": title, "chunks": count} for doc_id, title, count in rows]


def load_index_from_db(conn, doc_id: str, model: str) -> Index:
    """Chunks in file order (position), checking that every chunk has a vector for the model."""
    chunks = [
        {"chunk_id": chunk_id, "doc_id": doc_id, "page": page, "chunk_index": chunk_index,
         "kind": kind, "text": text}
        for chunk_id, page, chunk_index, kind, text in conn.execute(
            "SELECT chunk_id, page, chunk_index, kind, text FROM rag.chunks WHERE doc_id = %s ORDER BY position",
            (doc_id,),
        ).fetchall()
    ]
    vectors = conn.execute(
        "SELECT count(*) FROM rag.chunk_embeddings WHERE doc_id = %s AND model = %s", (doc_id, model)
    ).fetchone()[0]
    if not chunks or vectors != len(chunks):
        raise LookupError(
            f"{doc_id} with {model}: {len(chunks)} chunks, {vectors} vectors in the database; "
            f"run: python -m storage.load --doc-id {doc_id} --model {model}"
        )
    return Index(chunks=chunks, vectors=None, model_name=model)
