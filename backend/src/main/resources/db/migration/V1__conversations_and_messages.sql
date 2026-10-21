-- Schema "app" belongs to the backend (Flyway). The AI service owns schema "rag".

CREATE TABLE conversations (
    id         uuid PRIMARY KEY,
    doc_id     text NOT NULL,  -- refers to rag.documents, checked through the AI service API
    title      text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,
    lang            text,           -- language of the question, if given
    status          text,           -- assistant only: answered, not_found, not_in_report, ...
    citations       jsonb,          -- assistant only: [{marker, docId, page, chunkId}]
    cost_usd        numeric(12, 8), -- assistant only: estimated LLM cost
    model           text,           -- assistant only: null when refused before the LLM
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_by_conversation ON messages (conversation_id, id);
