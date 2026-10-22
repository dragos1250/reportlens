package dev.reportlens.backend.speech;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
@EnableConfigurationProperties(SpeechProperties.class)
public class SpeechConfig {

    @Bean
    ElevenLabsClient elevenLabsClient(SpeechProperties props) {
        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(5));
        requestFactory.setReadTimeout(Duration.ofSeconds(30));
        return new ElevenLabsClient(RestClient.builder().baseUrl(props.baseUrl()).requestFactory(requestFactory).build(),
                props);
    }
}
