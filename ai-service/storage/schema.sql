-- Tables owned by the AI service (schema "rag"). Idempotent: safe to run on every load.
-- The backend keeps its own tables in schema "app", managed by Flyway.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS rag;

CREATE TABLE IF NOT EXISTS rag.documents (
    doc_id        text PRIMARY KEY,
    title         text NOT NULL,
    source_url    text,
    chunks_sha256 text NOT NULL,  -- hash of the chunks file that was loaded
    loaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag.chunks (
    doc_id      text NOT NULL REFERENCES rag.documents (doc_id) ON DELETE CASCADE,
    position    integer NOT NULL,  -- line number in the chunks file; BM25 and vectors use it as row id
    chunk_id    text NOT NULL UNIQUE,
    page        integer NOT NULL,
    chunk_index integer NOT NULL,
    kind        text NOT NULL,
    text        text NOT NULL,
    PRIMARY KEY (doc_id, position)
);

-- One row per chunk and embedding model. No fixed dimension on the column, so
-- vectors of several models (384 for e5-small, 768 for e5-base) share the table.
-- No ANN index: an exact scan over a few thousand rows is fast and returns the same
-- ranking as the numpy search; an HNSW index (per model, fixed dimension) can come
-- when the data grows.
CREATE TABLE IF NOT EXISTS rag.chunk_embeddings (
    doc_id    text NOT NULL,
    position  integer NOT NULL,
    model     text NOT NULL,
    embedding vector NOT NULL,  -- normalised, so inner product = cosine similarity
    PRIMARY KEY (doc_id, model, position),
    FOREIGN KEY (doc_id, position) REFERENCES rag.chunks (doc_id, position) ON DELETE CASCADE
);
