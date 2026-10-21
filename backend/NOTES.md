# Backend and data notes (stage 7)

Decisions behind the Spring Boot API, the FastAPI service and the PostgreSQL schema,
with the measurements that support them. Measured on 2026-10-22 on a Windows laptop,
Docker Desktop, Java 25 (Temurin), Spring Boot 4.1.1.

## Architecture

```
React (stage 8) -> Spring Boot :8080 (/api)  -> FastAPI :8000 (/ask, /documents)
                          |                            |
                          +-- schema "app" --+-- schema "rag" (pgvector)
                                   PostgreSQL :5432 (docker compose, db only)
```

- **Spring Boot** is the public API: conversations, messages, history. It never calls the
  LLM and never sees the API key.
- **FastAPI** wraps the existing Python code (retrieval, guard, generation, citations).
  The API layer only translates HTTP to function calls; the logic is the code the CLI and
  the evaluations already test.
- **PostgreSQL** holds both services' data, in two schemas with one owner each.

## FastAPI (ai-service/api/)

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness, no model load |
| `GET /documents` | documents in the database: `doc_id`, `title`, `chunks` |
| `POST /ask` | `{question, doc_id, lang?, method?, translate_query?}` -> answer |

`POST /ask` returns `status` (`answered`, `not_found`, `not_in_report`, `incomplete`,
`invalid_output`), the answer with citations rendered as `[doc, p. N]`, `citations`
(marker, doc, page, chunk id), `passages` (all 5 sent, with text and a `cited` flag, for
highlighting in stage 8), `best_score`, `model`, `usage`, `cost_usd`, `timings`.

- `lang` is optional; when given it goes into the prompt (answer language) and into the
  guard's refusal message.
- Errors: 422 for invalid input (empty question, `lang` not two letters, unknown method),
  404 for an unknown document, 502 if the LLM call fails. The 502 body names only the
  error type, never the message, which could contain request details.
- Dependencies are injected (`Services`), so tests use a tiny index and a fake LLM.

## PostgreSQL + pgvector

### Schema `rag` (owned by the AI service, `ai-service/storage/schema.sql`)

| Table | Key | Content |
|---|---|---|
| `documents` | `doc_id` | title, source URL, hash of the chunks file loaded |
| `chunks` | `(doc_id, position)`, `chunk_id` unique | page, chunk index, kind, text |
| `chunk_embeddings` | `(doc_id, model, position)` | `embedding vector` (normalised) |

- `position` is the line number in the chunks file. BM25 and the vector search both use
  it as the row id, so the database search returns the same ids as the in-memory search.
- `embedding` has no fixed dimension, so e5-small (384) and e5-base (768) can share the
  table. The cost: no ANN index on it (an HNSW index needs a fixed dimension).
- Loading: `python -m storage.load --doc-id ...` replaces one document's rows in one
  transaction, using `COPY`.

### Schema `app` (owned by the backend, Flyway `V1__conversations_and_messages.sql`)

| Table | Key | Content |
|---|---|---|
| `conversations` | `id uuid` | `doc_id`, title, created_at |
| `messages` | `id` identity | conversation, role (`user`/`assistant`), content, lang, status, `citations jsonb`, `cost_usd`, model |

- The UUID is generated in Java, so a conversation's id is known before it is saved.
- `citations` is `jsonb`: a list read and written as a whole, never queried by field.
- `doc_id` has no foreign key to `rag.documents`: the schemas belong to different
  services. The backend checks the document through `GET /documents` instead.
- Hibernate runs with `ddl-auto=validate`: Flyway changes the schema, Hibernate only
  checks that the entities match it.

### Why the vector search moved to Postgres and BM25 did not

- **Vector search in pgvector**: one exact query per question
  (`ORDER BY embedding <#> query, position LIMIT k`). Vectors are normalised, so the
  negative inner product `<#>` ranks exactly like the cosine similarity used before.
  Measured: median 2.1 ms, max 2.8 ms for the top 50 over 2549 chunks.
- **BM25 stays in Python memory**: PostgreSQL full-text search (`ts_rank`) is not BM25.
  Its scoring would change the rankings, and with them the evaluation results that are
  the acceptance criterion. BM25 extensions exist (e.g. ParadeDB's `pg_search`) but are
  not in the pgvector image. The in-memory index builds in 0.09 s for 2549 chunks.

### Acceptance check: same results as the file-based search

| Check | Result |
|---|---|
| Chunks in the database vs `chunks.jsonl` | identical, all 2549 |
| Vectors in the database vs `.npy` | bitwise identical, 2549 x 384 |
| Semantic top-50 order, 22 questions | identical (0 differences) |
| Hybrid top-30 and BM25 top-30, 22 questions | identical (0 differences) |
| Largest score difference | 2.4e-7 (float rounding) |
| Hybrid retrieval evaluation, 10 questions | hit@5 5/10, hit@10 7/10, hit@20 8/10; table identical to the file run |
| Answer evaluation, 22 questions (gpt-6-luna) | 4/10 cite an expected page, 12/12 correct refusals (guard 1, LLM 11), 6/10 wrong refusals, cost $0.003843 |
| Same passages sent for every question | yes (22/22) |

Two answers cited a different page than in the file run (q01: 25 instead of 195; q05: 12
instead of 81). In both cases both pages were among the passages sent and contain the
answer: the LLM chose another passage, not a retrieval change.

### A pitfall found while measuring

Connecting to `localhost` took about 130 s per connection on Windows: `localhost` resolves
to IPv6 `::1` first, and the database port is published on IPv4 only. With `127.0.0.1`
it takes 0.02 s. Defaults and `.env.example` now use `127.0.0.1`.

### Rejected alternatives

- **A separate vector database (Chroma, Qdrant)**: one more service to run and back up,
  for 2.5k vectors that PostgreSQL searches in 2 ms. pgvector keeps chunks, vectors and
  conversations in one place.
- **An HNSW/IVFFlat index now**: approximate search can return a different top-k than the
  exact search, which would break the acceptance check; at 2.5k rows the exact scan is fast.
- **Spring Boot calling OpenAI directly**: the prompt, guard, citation checks and the API
  key would exist in two languages; one service owns generation instead.
- **One shared schema managed by Flyway**: the AI service's tables would depend on the
  backend's migrations. Two schemas, one owner each.
- **`ddl-auto=update`**: Hibernate would change the schema silently; Flyway migrations are
  explicit and versioned.
- **Conversations in the AI service**: it would mix the stateless question answering with
  user data; the backend owns history.

## Spring Boot (backend/)

Spring Boot 4.1.1, Java 25, Maven Wrapper (Maven 3.10.0 is downloaded by `mvnw` into
`~/.m2`, nothing installed system-wide).

| Endpoint | Result |
|---|---|
| `GET /api/documents` | documents from the AI service |
| `POST /api/conversations` `{docId, title?}` | 201, conversation; 404 if the document is unknown |
| `GET /api/conversations` | conversations, newest first |
| `GET /api/conversations/{id}/messages` | history, oldest first; 404 if unknown |
| `POST /api/conversations/{id}/messages` `{question, lang?}` | 201, the assistant's message |

- Errors are RFC 9457 problem details: 400 validation, 404 unknown, 502 AI service error.
- `ask` saves the question, calls the AI service, saves the answer. It is not one database
  transaction: the AI call takes seconds and should not hold a connection. If the call
  fails, the question stays in the history and the client gets 502.
- The AI client is a plain `RestClient` with a 5 s connect and 60 s read timeout.

### Tests (no LLM calls)

- `AiServiceClientTest` (3): a mock HTTP server stands in for FastAPI. It checks the
  snake_case request, the parsing of a real-shaped response, and that 502 becomes an exception.
- `ApiIntegrationTest` (6): real PostgreSQL in Testcontainers (same pgvector image), Flyway
  schema, controllers and JPA; the AI client is a Mockito mock. Covers ask and history,
  a guard refusal, 404s, validation 400s, and 502 with the question kept.
- `BackendApplicationTests` (1): the context starts.

### End-to-end run (real services, 2026-10-22)

Spring Boot -> FastAPI (store: postgres) -> gpt-6-luna, through `/api`:

- "Care sunt cele trei priorități strategice ale Vodafone?" (ro): 201, `answered`, cites
  page 12, cost $0.0000374 (prompt cached by OpenAI).
- "Care este capitala Franței?" (ro): 201, `not_in_report`, no model, cost 0.
- Invalid `lang`: 400. Unknown document: 404.
- `app.messages` holds the 4 rows (2 questions, 2 answers) with status, model, cost and
  citations.

## Running it locally

```bash
# 1. database (POSTGRES_PASSWORD must be set, e.g. in .env)
docker compose up -d db
# 2. load chunks and vectors (after ingestion and build_index)
cd ai-service && python -m storage.load --doc-id vodafone-20f-fy26
# 3. AI service
uvicorn api.main:app --port 8000
# 4. backend (reads POSTGRES_* from the environment, not from .env; see README.md)
cd backend && POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' ../.env | cut -d= -f2-)" ./mvnw spring-boot:run
```

Checked on 2026-10-22 after recreating the database volume with the password from `.env`:
the backend started with the variable passed only to its process, Flyway applied
migration 1, and `GET /api/conversations` returned 200 with no authentication errors.
No password is in any tracked file or in the git history.

On Windows, send UTF-8 request bodies from a client that encodes them correctly (httpx,
Postman): `curl` in Git Bash turned "ă" into "?" during testing.
