import uuid

import numpy as np
import pytest

from retrieval.search import NumpyVectorStore, top_k
from storage.db import conninfo

VECTORS = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.6, 0.8, 0.0], [0.0, 0.6, 0.8]], dtype=np.float32)
QUERY = np.array([0.0, 1.0, 0.0], dtype=np.float32)


def test_numpy_store_matches_plain_top_k_and_best_score():
    store = NumpyVectorStore(VECTORS)
    assert store.top_k(QUERY, 3) == top_k(QUERY, VECTORS, 3)
    assert store.best_score(QUERY) == 1.0


def test_conninfo_requires_password_and_never_shows_it():
    with pytest.raises(ValueError, match="POSTGRES_PASSWORD is not set"):
        conninfo({})
    info = conninfo({"POSTGRES_PASSWORD": "s3cret"})
    assert "host=127.0.0.1" in info  # not "localhost": IPv6 lookup was slow on Windows


def test_unknown_store_is_rejected():
    from storage.factory import make_searcher
    with pytest.raises(ValueError, match="unknown store"):
        make_searcher("d", "m", embedder=None, store="redis")


@pytest.fixture
def pg_doc():
    """A throwaway document in the running database; skipped if there is none."""
    try:
        from storage.db import apply_schema, connect
        conn = connect()
    except Exception:
        pytest.skip("PostgreSQL not available (docker compose up -d db, POSTGRES_PASSWORD)")
    apply_schema(conn)
    doc_id = f"test-{uuid.uuid4().hex[:8]}"
    with conn.transaction():
        conn.execute("INSERT INTO rag.documents (doc_id, title, chunks_sha256) VALUES (%s, 't', 'x')", (doc_id,))
        for i, vector in enumerate(VECTORS):
            conn.execute("INSERT INTO rag.chunks (doc_id, position, chunk_id, page, chunk_index, kind, text) "
                         "VALUES (%s, %s, %s, %s, 0, 'text', %s)", (doc_id, i, f"{doc_id}-{i}", i + 1, f"text {i}"))
            conn.execute("INSERT INTO rag.chunk_embeddings (doc_id, position, model, embedding) "
                         "VALUES (%s, %s, 'm', %s)", (doc_id, i, vector))
    yield conn, doc_id
    conn.execute("DELETE FROM rag.documents WHERE doc_id = %s", (doc_id,))  # cascades to its rows only


def test_pgvector_search_matches_numpy(pg_doc):
    from storage.pgstore import PgVectorStore
    conn, doc_id = pg_doc
    store = PgVectorStore(conn, doc_id, "m")
    numpy_ranking = NumpyVectorStore(VECTORS).top_k(QUERY, 4)
    pg_ranking = store.top_k(QUERY, 4)
    assert [row for row, _ in pg_ranking] == [row for row, _ in numpy_ranking]
    assert [s for _, s in pg_ranking] == pytest.approx([s for _, s in numpy_ranking], abs=1e-6)
    assert store.best_score(QUERY) == pytest.approx(1.0, abs=1e-6)


def test_index_from_db_keeps_file_order_and_checks_vectors(pg_doc):
    from storage.pgstore import load_index_from_db
    conn, doc_id = pg_doc
    index = load_index_from_db(conn, doc_id, "m")
    assert [c["page"] for c in index.chunks] == [1, 2, 3, 4]
    assert index.vectors is None
    with pytest.raises(LookupError, match="storage.load"):
        load_index_from_db(conn, doc_id, "other-model")
