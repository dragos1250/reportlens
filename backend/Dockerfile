# Spring Boot API. Build context: the repository root (one .dockerignore keeps .env and data/ out).
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
# A Windows checkout may give mvnw CRLF line endings, which sh cannot run.
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw && ./mvnw -q dependency:go-offline
COPY backend/src src
# Tests need Docker (Testcontainers); they run outside the image build.
RUN ./mvnw -q -DskipTests package && cp target/*.jar /src/app.jar

FROM eclipse-temurin:25-jre
# curl only for the health check below; the base image has neither curl nor wget.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app
USER app
WORKDIR /app
COPY --from=build /src/app.jar app.jar
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=6 \
  CMD curl -fsS http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
