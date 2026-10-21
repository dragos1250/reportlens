"""Build a Searcher whose vectors come from PostgreSQL (default) or from local files."""

from functools import lru_cache

from retrieval.embedder import Embedder
from retrieval.index import load_index
from retrieval.reranker import Reranker
from retrieval.search import Searcher

STORES = ("postgres", "files")
DEFAULT_STORE = "postgres"


@lru_cache(maxsize=1)
def shared_connection():
    """One connection per process; psycopg serialises its use across threads."""
    from .db import connect
    return connect()


def make_searcher(doc_id: str, model: str, embedder: Embedder, reranker: Reranker | None = None,
                  store: str = DEFAULT_STORE) -> Searcher:
    if store == "files":
        return Searcher(load_index(doc_id, model), embedder, reranker)
    if store == "postgres":
        from .pgstore import PgVectorStore, load_index_from_db
        conn = shared_connection()
        return Searcher(load_index_from_db(conn, doc_id, model), embedder, reranker,
                        vector_store=PgVectorStore(conn, doc_id, model))
    raise ValueError(f"unknown store {store!r}; choose from {STORES}")
