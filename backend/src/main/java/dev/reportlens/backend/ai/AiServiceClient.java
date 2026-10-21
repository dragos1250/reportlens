package dev.reportlens.backend.ai;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;

/**
 * HTTP client for the FastAPI service. The backend never calls the LLM itself:
 * search, generation, citations and the API key all stay in the AI service.
 */
@Component
public class AiServiceClient {

    private final RestClient http;

    public AiServiceClient(RestClient aiRestClient) {
        this.http = aiRestClient;
    }

    public List<AiDtos.Document> documents() {
        try {
            return http.get().uri("/documents").retrieve().body(new ParameterizedTypeReference<>() {
            });
        } catch (RestClientException e) {
            throw new AiServiceException("could not list documents", e);
        }
    }

    public AiDtos.AskResponse ask(AiDtos.AskRequest request) {
        try {
            return http.post().uri("/ask").contentType(MediaType.APPLICATION_JSON).body(request)
                    .retrieve().body(AiDtos.AskResponse.class);
        } catch (RestClientException e) {
            throw new AiServiceException("could not get an answer", e);
        }
    }
}
