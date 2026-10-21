# backend

Spring Boot 4.1.1 (Java 25) REST API: documents, conversations and message history,
stored in PostgreSQL (schema `app`, Flyway). Answers come from the AI service (FastAPI).

```bash
./mvnw test             # unit and integration tests (Docker needed for Testcontainers)
./mvnw spring-boot:run  # needs POSTGRES_PASSWORD and the AI service on :8000
```

## Database password

`application.properties` only references `${POSTGRES_PASSWORD}`; the value is never in a
versioned file. Spring Boot does not read `.env`, so pass the variable to the process:

```powershell
# PowerShell: typed, masked, kept only in this terminal session
$env:POSTGRES_PASSWORD = Read-Host -MaskInput "Postgres password"
.\mvnw.cmd spring-boot:run
```

```bash
# Git Bash: copy only this one variable from .env into this command's environment
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' ../.env | cut -d= -f2-)" ./mvnw spring-boot:run
```

- In an IDE, set it in the run configuration's environment variables (`.vscode/` and
  `.idea/` are git-ignored).
- Avoid `source ../.env` or importing the whole `.env` into Spring: that would also hand
  `LLM_API_KEY` to the backend, which never needs it.
- In a deployment, it comes from the platform's secret store (stage 11).

Endpoints, schema and design decisions: [NOTES.md](NOTES.md).
