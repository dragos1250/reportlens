package dev.reportlens.backend;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	/** Same image and version as docker-compose.yml, so tests run against the real setup. */
	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("pgvector/pgvector:0.8.7-pg17")
				.asCompatibleSubstituteFor("postgres"));
	}

}
