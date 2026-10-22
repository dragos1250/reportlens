package dev.reportlens.backend.ai;

import dev.reportlens.backend.conversation.NotFoundException;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.OutputStream;
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

    /**
     * Streams a report PDF from the AI service into {@code sink} without holding it in
     * memory: the bytes are copied while they arrive. A {@code Range} header is passed
     * through, so the browser's pdf.js can fetch the file in parts (206 Partial Content).
     *
     * @throws NotFoundException if the AI service does not know the document
     */
    public void streamPdf(String docId, String range, PdfSink sink) {
        try {
            http.get().uri("/documents/{docId}/pdf", docId)
                    .headers(h -> {
                        if (range != null) {
                            h.set(HttpHeaders.RANGE, range);
                        }
                    })
                    .exchange((request, response) -> {
                        int status = response.getStatusCode().value();
                        if (status == 404) {
                            throw new NotFoundException("no PDF for document: " + docId);
                        }
                        if (status != 200 && status != 206 && status != 416) {
                            throw new AiServiceException("PDF request failed with status " + status, null);
                        }
                        try (OutputStream out = sink.start(status, pdfHeaders(response.getHeaders()))) {
                            response.getBody().transferTo(out);
                        }
                        return null;
                    });
        } catch (RestClientException e) {
            throw new AiServiceException("could not get the PDF", e);
        }
    }

    /** Only the headers the browser needs to read a (partial) PDF. */
    private static HttpHeaders pdfHeaders(HttpHeaders upstream) {
        var headers = new HttpHeaders();
        for (String name : List.of(HttpHeaders.CONTENT_TYPE, HttpHeaders.CONTENT_LENGTH, HttpHeaders.CONTENT_RANGE,
                HttpHeaders.ACCEPT_RANGES, HttpHeaders.CONTENT_DISPOSITION, HttpHeaders.ETAG,
                HttpHeaders.LAST_MODIFIED)) {
            String value = upstream.getFirst(name);
            if (value != null) {
                headers.set(name, value);
            }
        }
        return headers;
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
