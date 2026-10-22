package dev.reportlens.backend.api;

import dev.reportlens.backend.TestcontainersConfiguration;
import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.ai.AiServiceClient;
import dev.reportlens.backend.ai.AiServiceException;
import dev.reportlens.backend.ai.PdfSink;
import dev.reportlens.backend.conversation.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.OutputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full stack except the AI service: real PostgreSQL (Testcontainers) with the Flyway
 * schema, real controllers and JPA; the FastAPI client is a mock, so no LLM call is made.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ApiIntegrationTest {

    private static final String DOC = "vodafone-20f-fy26";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @MockitoBean
    private AiServiceClient ai;

    @BeforeEach
    void knownDocuments() {
        when(ai.documents()).thenReturn(List.of(new AiDtos.Document(DOC, "Vodafone 20-F FY26", 2549)));
    }

    private String startConversation() throws Exception {
        String body = mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docId\": \"" + DOC + "\", \"title\": \"Strategy\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asString();
    }

    @Test
    void documentsComeFromTheAiService() throws Exception {
        mvc.perform(get("/api/documents"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].docId").value(DOC))
                .andExpect(jsonPath("$[0].chunks").value(2549));
    }

    @Test
    void askStoresQuestionAndAnswerWithCitations() throws Exception {
        when(ai.ask(new AiDtos.AskRequest("Care sunt prioritățile?", DOC, "ro"))).thenReturn(new AiDtos.AskResponse(
                "answered", "Customers, Simplicity și Growth [vodafone-20f-fy26, p. 12].",
                "Customers, Simplicity și Growth [P4].",
                List.of(new AiDtos.Citation("P4", DOC, 12, "vodafone-20f-fy26-p0012-c001")),
                List.of(new AiDtos.Passage("P1", DOC, 9, "vodafone-20f-fy26-p0009-c000", "Our purpose ...", false),
                        new AiDtos.Passage("P4", DOC, 12, "vodafone-20f-fy26-p0012-c001",
                                "Customers, Simplicity and Growth", true)),
                "gpt-6-luna", 0.000186));
        String id = startConversation();

        mvc.perform(post("/api/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\": \"Care sunt prioritățile?\", \"lang\": \"ro\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("assistant"))
                .andExpect(jsonPath("$.status").value("answered"))
                .andExpect(jsonPath("$.content").value("Customers, Simplicity și Growth [P4]."))
                .andExpect(jsonPath("$.passages.length()").value(2))
                .andExpect(jsonPath("$.passages[1].marker").value("P4"))
                .andExpect(jsonPath("$.passages[1].text").value("Customers, Simplicity and Growth"))
                .andExpect(jsonPath("$.passages[1].cited").value(true))
                .andExpect(jsonPath("$.citations[0].page").value(12))
                .andExpect(jsonPath("$.citations[0].chunkId").value("vodafone-20f-fy26-p0012-c001"))
                .andExpect(jsonPath("$.model").value("gpt-6-luna"));

        String history = mvc.perform(get("/api/conversations/" + id + "/messages"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode messages = json.readTree(history);
        assertThat(messages).hasSize(2);
        assertThat(messages.get(0).get("role").asString()).isEqualTo("user");
        assertThat(messages.get(0).get("content").asString()).isEqualTo("Care sunt prioritățile?");
        assertThat(messages.get(1).get("citations").get(0).get("page").asInt()).isEqualTo(12);
        assertThat(messages.get(1).get("costUsd").decimalValue()).isEqualByComparingTo("0.000186");
    }

    @Test
    void guardRefusalIsStoredWithoutModelOrCitations() throws Exception {
        String refusal = "Raportul nu pare să conțină informații despre această întrebare.";
        when(ai.ask(any())).thenReturn(new AiDtos.AskResponse("not_in_report", refusal, refusal,
                List.of(), List.of(), null, 0.0));
        String id = startConversation();

        mvc.perform(post("/api/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\": \"Care este capitala Franței?\", \"lang\": \"ro\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("not_in_report"))
                .andExpect(jsonPath("$.citations").isEmpty())
                .andExpect(jsonPath("$.model").doesNotExist());
    }

    @Test
    void pdfIsStreamedWithRangeHeadersPassedThrough() throws Exception {
        byte[] part = "%PDF-1.7 first bytes".getBytes();
        doAnswer(invocation -> {
            PdfSink sink = invocation.getArgument(2);
            var headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.set(HttpHeaders.CONTENT_RANGE, "bytes 0-19/32051349");
            headers.setContentLength(part.length);
            try (OutputStream out = sink.start(206, headers)) {
                out.write(part);
            }
            return null;
        }).when(ai).streamPdf(eq(DOC), eq("bytes=0-19"), any());

        mvc.perform(get("/api/documents/" + DOC + "/pdf").header(HttpHeaders.RANGE, "bytes=0-19"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 0-19/32051349"))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "application/pdf"))
                .andExpect(content().bytes(part));
    }

    @Test
    void pdfOfUnknownDocumentIs404() throws Exception {
        doThrow(new NotFoundException("no PDF for document: nope")).when(ai).streamPdf(eq("nope"), any(), any());
        mvc.perform(get("/api/documents/nope/pdf")).andExpect(status().isNotFound());
    }

    @Test
    void unknownDocumentOrConversationIs404() throws Exception {
        mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docId\": \"missing\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/conversations/00000000-0000-0000-0000-000000000000/messages"))
                .andExpect(status().isNotFound());
    }

    @Test
    void invalidQuestionIs400AndNeverReachesTheAiService() throws Exception {
        String id = startConversation();
        mvc.perform(post("/api/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\": \"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\": \"q\", \"lang\": \"romanian\"}"))
                .andExpect(status().isBadRequest());
        verify(ai, never()).ask(any());
    }

    @Test
    void aiFailureIs502AndTheQuestionStaysInHistory() throws Exception {
        when(ai.ask(any())).thenThrow(new AiServiceException("could not get an answer", null));
        String id = startConversation();

        mvc.perform(post("/api/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\": \"q\"}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value("AI service error: could not get an answer"));
        mvc.perform(get("/api/conversations/" + id + "/messages"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].role").value("user"));
    }
}
