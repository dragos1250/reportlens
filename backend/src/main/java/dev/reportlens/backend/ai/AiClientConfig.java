package dev.reportlens.backend.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
public class AiClientConfig {

    @Bean
    RestClient aiRestClient(@Value("${reportlens.ai-service.url}") String baseUrl,
                            @Value("${reportlens.ai-service.read-timeout}") Duration readTimeout) {
        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(5));
        requestFactory.setReadTimeout(readTimeout);  // an answer waits for the LLM: a few seconds
        return RestClient.builder().baseUrl(baseUrl).requestFactory(requestFactory).build();
    }
}
