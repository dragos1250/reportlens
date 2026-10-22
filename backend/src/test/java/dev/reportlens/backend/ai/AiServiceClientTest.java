package dev.reportlens.backend.ai;

import dev.reportlens.backend.conversation.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayOutputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The FastAPI service is replaced by a mock HTTP server: no network, no LLM. */
class AiServiceClientTest {

    private MockRestServiceServer server;
    private AiServiceClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://ai.test");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new AiServiceClient(builder.build());
    }

    @Test
    void askSendsSnakeCaseJsonAndReadsTheAnswer() {
        server.expect(requestTo("http://ai.test/ask"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"question": "Care sunt prioritățile?", "doc_id": "vodafone-20f-fy26", "lang": "ro"}
                        """))
                .andRespond(withSuccess("""
                        {"status": "answered", "answer": "Customers, Simplicity și Growth [vodafone-20f-fy26, p. 12].",
                         "answer_marked": "Customers, Simplicity și Growth [P4].",
                         "question": "Care sunt prioritățile?", "search_query": "Care sunt prioritățile?",
                         "best_score": 0.866,
                         "citations": [{"marker": "P4", "doc_id": "vodafone-20f-fy26", "page": 12,
                                        "chunk_id": "vodafone-20f-fy26-p0012-c001"}],
                         "passages": [], "problems": [], "model": "gpt-6-luna",
                         "usage": {"input_tokens": 1264, "output_tokens": 56, "reasoning_tokens": 0},
                         "cost_usd": 0.000186, "timings": {"retrieval_seconds": 0.02, "llm_seconds": 2.9}}
                        """, MediaType.APPLICATION_JSON));

        AiDtos.AskResponse response = client.ask(
                new AiDtos.AskRequest("Care sunt prioritățile?", "vodafone-20f-fy26", "ro"));

        assertThat(response.status()).isEqualTo("answered");
        assertThat(response.citations()).singleElement()
                .satisfies(c -> {
                    assertThat(c.page()).isEqualTo(12);
                    assertThat(c.chunkId()).isEqualTo("vodafone-20f-fy26-p0012-c001");
                });
        assertThat(response.answerMarked()).isEqualTo("Customers, Simplicity și Growth [P4].");
        assertThat(response.costUsd()).isEqualTo(0.000186);
        server.verify();
    }

    @Test
    void explainSendsTheSelectionAsSnakeCaseJsonAndReadsTheStatus() {
        server.expect(requestTo("http://ai.test/explain"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"doc_id": "vodafone-20f-fy26", "page": 25, "text": "undrawn committed facilities of €7.6 billion",
                         "question": null, "lang": "ro"}
                        """))
                .andRespond(withSuccess("""
                        {"status": "explained", "answer": "Linii de credit nefolosite.", "page": 25,
                         "quote": "undrawn committed facilities of €7.6 billion", "problems": [],
                         "model": "gpt-6-luna", "usage": {"input_tokens": 400, "output_tokens": 60, "reasoning_tokens": 0},
                         "cost_usd": 0.00007, "llm_seconds": 1.8}
                        """, MediaType.APPLICATION_JSON));

        AiDtos.ExplainResponse response = client.explain(new AiDtos.ExplainRequest(
                "vodafone-20f-fy26", 25, "undrawn committed facilities of €7.6 billion", null, "ro"));

        assertThat(response.status()).isEqualTo("explained");
        assertThat(response.page()).isEqualTo(25);
        assertThat(response.costUsd()).isEqualTo(0.00007);
        server.verify();
    }

    @Test
    void compareSendsBothDocumentIdsAndReadsTheMissingOnes() {
        server.expect(requestTo("http://ai.test/compare"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"question": "Revenue?", "doc_ids": ["vodafone-20f-fy26", "dtag-ar-2025"], "lang": null}
                        """))
                .andRespond(withSuccess("""
                        {"status": "partial", "answer": "x [dtag-ar-2025, p. 44].", "answer_marked": "x [P1].",
                         "question": "Revenue?", "search_query": "Revenue?", "best_score": null,
                         "citations": [{"marker": "P1", "doc_id": "dtag-ar-2025", "page": 44, "chunk_id": "c"}],
                         "passages": [], "problems": [], "model": "gpt-6-luna", "usage": null, "cost_usd": 0.0002,
                         "timings": {"retrieval_seconds": 0.2, "llm_seconds": 2.0},
                         "doc_ids": ["vodafone-20f-fy26", "dtag-ar-2025"], "missing_doc_ids": ["vodafone-20f-fy26"],
                         "best_scores": {"vodafone-20f-fy26": 0.7, "dtag-ar-2025": 0.85}}
                        """, MediaType.APPLICATION_JSON));

        AiDtos.CompareResponse response = client.compare(new AiDtos.CompareRequest(
                "Revenue?", List.of("vodafone-20f-fy26", "dtag-ar-2025"), null));

        assertThat(response.status()).isEqualTo("partial");
        assertThat(response.missingDocIds()).containsExactly("vodafone-20f-fy26");
        assertThat(response.citations().getFirst().docId()).isEqualTo("dtag-ar-2025");
        server.verify();
    }

    @Test
    void documentsAreRead() {
        server.expect(requestTo("http://ai.test/documents"))
                .andRespond(withSuccess("""
                        [{"doc_id": "vodafone-20f-fy26", "title": "Vodafone 20-F FY26", "chunks": 2549}]
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.documents()).containsExactly(
                new AiDtos.Document("vodafone-20f-fy26", "Vodafone 20-F FY26", 2549));
    }

    @Test
    void pdfIsCopiedToTheSinkWithTheRangeHeaderPassedOn() {
        byte[] part = "%PDF-1.7 part".getBytes();
        var headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_RANGE, "bytes 0-12/32051349");
        headers.set("X-Internal", "not forwarded");
        server.expect(requestTo("http://ai.test/documents/vodafone-20f-fy26/pdf"))
                .andExpect(header(HttpHeaders.RANGE, "bytes=0-12"))
                .andRespond(withStatus(HttpStatus.PARTIAL_CONTENT).contentType(MediaType.APPLICATION_PDF)
                        .headers(headers).body(part));

        var out = new ByteArrayOutputStream();
        int[] status = new int[1];
        HttpHeaders[] forwarded = new HttpHeaders[1];
        client.streamPdf("vodafone-20f-fy26", "bytes=0-12", (code, h) -> {
            status[0] = code;
            forwarded[0] = h;
            return out;
        });

        assertThat(status[0]).isEqualTo(206);
        assertThat(out.toByteArray()).isEqualTo(part);
        assertThat(forwarded[0].getFirst(HttpHeaders.CONTENT_RANGE)).isEqualTo("bytes 0-12/32051349");
        assertThat(forwarded[0].getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
        assertThat(forwarded[0].containsHeader("X-Internal")).isFalse();
    }

    @Test
    void pdfNotFoundBecomesNotFoundException() {
        server.expect(requestTo("http://ai.test/documents/nope/pdf")).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> client.streamPdf("nope", null, (code, h) -> new ByteArrayOutputStream()))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void serverErrorBecomesAiServiceException() {
        server.expect(requestTo("http://ai.test/ask")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        assertThatThrownBy(() -> client.ask(new AiDtos.AskRequest("q", "d", null)))
                .isInstanceOf(AiServiceException.class);
    }
}
