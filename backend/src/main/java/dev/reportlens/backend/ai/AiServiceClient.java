package dev.reportlens.backend.ai;

import dev.reportlens.backend.conversation.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import dev.reportlens.backend.limits.LimitExceededException;
import dev.reportlens.backend.uploads.UploadRejectedException;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * HTTP client for the FastAPI service. The backend never calls the LLM itself:
 * search, generation, citations and the API key all stay in the AI service.
 */
@Component
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);

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
                        // From here on the browser has the status and headers: errors can
                        // no longer become a 502, so copy() decides what each one means.
                        copy(docId, response.getBody(), sink.start(status, pdfHeaders(response.getHeaders())));
                        return null;
                    });
        } catch (RestClientException e) {
            // Nothing was sent to the browser yet (connection refused, timeout): a real 502.
            throw new AiServiceException("could not get the PDF", e);
        }
    }

    /**
     * Copies the PDF bytes while they arrive and tells apart who stopped the transfer:
     * <ul>
     *   <li>the browser left (pdf.js cancels requests, the page reloads): normal, DEBUG only;</li>
     *   <li>the AI service stopped mid-transfer: WARN in one line, nothing else can be sent;</li>
     *   <li>any other write error is unexpected and is rethrown.</li>
     * </ul>
     */
    static void copy(String docId, InputStream in, OutputStream out) {
        byte[] buffer = new byte[8192];
        while (true) {
            int read;
            try {
                read = in.read(buffer);
            } catch (IOException e) {
                log.warn("AI service stopped while streaming the PDF of {}: {}", docId, e.toString());
                return;
            }
            if (read == -1) {
                break;
            }
            if (!write(docId, out, buffer, read)) {
                return;
            }
        }
        write(docId, out, buffer, 0); // flush
    }

    /** False if the browser has gone, so the copy stops quietly. */
    private static boolean write(String docId, OutputStream out, byte[] buffer, int length) {
        try {
            if (length > 0) {
                out.write(buffer, 0, length);
            } else {
                out.flush();
            }
            return true;
        } catch (IOException e) {
            if (isClientGone(e)) {
                log.debug("Browser closed the connection while receiving the PDF of {}: {}", docId, e.toString());
                return false;
            }
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Only the signs of a browser that disconnected: Tomcat's ClientAbortException (matched
     * by name, to keep the servlet container out of this class) or a "connection reset" /
     * "broken pipe" anywhere in the cause chain. Other IO errors are not hidden.
     */
    static boolean isClientGone(Throwable error) {
        for (Throwable e = error; e != null; e = e.getCause()) {
            if (e.getClass().getSimpleName().equals("ClientAbortException")) {
                return true;
            }
            String message = e.getMessage() == null ? "" : e.getMessage().toLowerCase(Locale.ROOT);
            if (message.contains("connection reset") || message.contains("broken pipe")) {
                return true;
            }
        }
        return false;
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

    public AiDtos.ExplainResponse explain(AiDtos.ExplainRequest request) {
        try {
            return http.post().uri("/explain").contentType(MediaType.APPLICATION_JSON).body(request)
                    .retrieve().body(AiDtos.ExplainResponse.class);
        } catch (RestClientException e) {
            throw new AiServiceException("could not get an explanation", e);
        }
    }

    /** Any document by id, built-in or uploaded (uploads are not in the list). */
    public Optional<AiDtos.Document> document(String docId) {
        try {
            return Optional.ofNullable(http.get().uri("/documents/{docId}", docId).retrieve()
                    .body(AiDtos.Document.class));
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (RestClientException e) {
            throw new AiServiceException("could not read the document", e);
        }
    }

    /**
     * Sends the PDF as the request body; the file name travels URL-encoded in X-Filename
     * and is only a display title. The AI service's refusals keep their message for the user.
     */
    public AiDtos.UploadAccepted upload(byte[] pdf, String filename) {
        try {
            return http.post().uri("/uploads").contentType(MediaType.APPLICATION_PDF)
                    .header("X-Filename", URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20"))
                    .body(pdf).retrieve().body(AiDtos.UploadAccepted.class);
        } catch (HttpClientErrorException e) {
            String detail = detail(e, "The upload was not accepted.");
            if (e.getStatusCode().value() == 429) {
                throw new LimitExceededException(detail, 3600);
            }
            throw new UploadRejectedException(HttpStatus.UNPROCESSABLE_CONTENT, detail);
        } catch (RestClientException e) {
            throw new AiServiceException("could not upload the document", e);
        }
    }

    public Optional<AiDtos.UploadJob> uploadJob(String jobId) {
        try {
            return Optional.ofNullable(http.get().uri("/uploads/{jobId}", jobId).retrieve()
                    .body(AiDtos.UploadJob.class));
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (RestClientException e) {
            throw new AiServiceException("could not read the upload", e);
        }
    }

    /** True if an uploaded document was deleted; built-in reports are never deleted. */
    public boolean deleteDocument(String docId) {
        try {
            http.delete().uri("/documents/{docId}", docId).retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return false;
        } catch (RestClientException e) {
            throw new AiServiceException("could not delete the document", e);
        }
    }

    private static String detail(RestClientResponseException e, String fallback) {
        try {
            AiDtos.ErrorDetail body = e.getResponseBodyAs(AiDtos.ErrorDetail.class);
            return body != null && body.detail() != null ? body.detail() : fallback;
        } catch (RuntimeException notJson) {
            return fallback;
        }
    }

    public AiDtos.CompareResponse compare(AiDtos.CompareRequest request) {
        try {
            return http.post().uri("/compare").contentType(MediaType.APPLICATION_JSON).body(request)
                    .retrieve().body(AiDtos.CompareResponse.class);
        } catch (RestClientException e) {
            throw new AiServiceException("could not get a comparison", e);
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
