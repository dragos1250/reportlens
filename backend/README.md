# backend

Spring Boot 4.1.1 (Java 25) REST API: documents, conversations and message history,
stored in PostgreSQL (schema `app`, Flyway). Answers come from the AI service (FastAPI).

```bash
./mvnw test             # unit and integration tests (Docker needed for Testcontainers)
./mvnw spring-boot:run  # needs POSTGRES_PASSWORD in the environment and the AI service on :8000
```

Endpoints, schema and design decisions: [NOTES.md](NOTES.md).
