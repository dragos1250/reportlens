package dev.reportlens.backend.ai;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
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
        assertThat(response.costUsd()).isEqualTo(0.000186);
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
    void serverErrorBecomesAiServiceException() {
        server.expect(requestTo("http://ai.test/ask")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        assertThatThrownBy(() -> client.ask(new AiDtos.AskRequest("q", "d", null)))
                .isInstanceOf(AiServiceException.class);
    }
}
