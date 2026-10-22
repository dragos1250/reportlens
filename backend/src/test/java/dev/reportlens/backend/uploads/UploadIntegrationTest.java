package dev.reportlens.backend.uploads;

import dev.reportlens.backend.TestcontainersConfiguration;
import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.ai.AiServiceClient;
import dev.reportlens.backend.conversation.ConversationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Uploads enabled, with small limits: 1 MB, 2 uploads per hour per IP. nginx is 10.0.0.5. */
@SpringBootTest(properties = {
        "reportlens.uploads.enabled=true",
        "reportlens.uploads.max-mb=1",
        "reportlens.uploads.per-hour=2",
        "reportlens.limits.trusted-proxies=10.0.0.5",
})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UploadIntegrationTest {

    private static final byte[] PDF = "%PDF-1.4 tiny".getBytes();
    private static final String UPLOADED = "upload-" + "a".repeat(32);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConversationRepository conversations;

    @MockitoBean
    private AiServiceClient ai;

    @BeforeEach
    void aiService() {
        when(ai.upload(any(), anyString())).thenReturn(new AiDtos.UploadAccepted("job1", UPLOADED, "Report", "queued"));
        when(ai.uploadJob("job1")).thenReturn(Optional.of(
                new AiDtos.UploadJob("job1", UPLOADED, "Report", "ready", null, 8, 8, null, null)));
        when(ai.document(UPLOADED)).thenReturn(Optional.of(
                new AiDtos.Document(UPLOADED, "Report", 8, "upload", 9, 1, null)));
        when(ai.document("vodafone-20f-fy26")).thenReturn(Optional.of(
                new AiDtos.Document("vodafone-20f-fy26", "Vodafone", 2549)));
    }

    private ResultActions upload(String forwardedFor, byte[] body, String filename) throws Exception {
        var request = post("/api/uploads").contentType(MediaType.APPLICATION_PDF).content(body)
                .with(r -> {
                    r.setRemoteAddr("10.0.0.5");
                    return r;
                })
                .header("X-Forwarded-For", forwardedFor);
        if (filename != null) {
            request.header("X-Filename", filename);
        }
        return mvc.perform(request);
    }

    @Test
    void theConfigSaysUploadsAreOn() throws Exception {
        mvc.perform(get("/api/config"))
                .andExpect(jsonPath("$.uploadsEnabled").value(true))
                .andExpect(jsonPath("$.maxUploadMb").value(1));
    }

    @Test
    void aPdfIsAcceptedAsTheRawBodyAndItsNameDecoded() throws Exception {
        upload("203.0.113.1", PDF, "Annual%20Report%202025.pdf")
                .andExpect(status().isAccepted())
                .andExpect(header().string("Location", "/api/uploads/job1"))
                .andExpect(jsonPath("$.jobId").value("job1"))
                .andExpect(jsonPath("$.docId").value(UPLOADED));
        verify(ai).upload(PDF, "Annual Report 2025.pdf");
    }

    @Test
    void aFileOverTheSizeLimitIs413AndNeverSent() throws Exception {
        upload("203.0.113.2", new byte[1024 * 1024 + 1], "big.pdf")
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.detail").value("The file is larger than 1 MB."));
        verify(ai, never()).upload(any(), anyString());
    }

    @Test
    void theAiServicesRefusalReachesTheUser() throws Exception {
        when(ai.upload(any(), anyString())).thenThrow(new UploadRejectedException(HttpStatus.UNPROCESSABLE_CONTENT,
                "Only 1 of 10 pages have a text layer."));
        upload("203.0.113.3", PDF, null)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.detail").value("Only 1 of 10 pages have a text layer."));
    }

    @Test
    void uploadsPerHourAreLimitedPerClientIp() throws Exception {
        upload("203.0.113.4", PDF, null).andExpect(status().isAccepted());
        upload("203.0.113.4", PDF, null).andExpect(status().isAccepted());
        upload("203.0.113.4", PDF, null)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "1800"));  // 2 per hour: one every 30 minutes
        upload("203.0.113.5", PDF, null).andExpect(status().isAccepted());
    }

    @Test
    void oneUploadAtATimePerClient() throws Exception {
        when(ai.uploadJob("job1")).thenReturn(Optional.of(
                new AiDtos.UploadJob("job1", UPLOADED, "Report", "indexing", "Indexing", 64, 200, null, null)));
        upload("203.0.113.6", PDF, null).andExpect(status().isAccepted());
        upload("203.0.113.6", PDF, null)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("Your previous upload")));
    }

    @Test
    void theJobIsPassedOnAndAnUnknownOneIs404() throws Exception {
        mvc.perform(get("/api/uploads/job1"))
                .andExpect(jsonPath("$.state").value("ready"))
                .andExpect(jsonPath("$.docId").value(UPLOADED));
        mvc.perform(get("/api/uploads/nope")).andExpect(status().isNotFound());
    }

    @Test
    void anUploadedReportOpensByIdAndCanBeComparedWithABuiltInOne() throws Exception {
        mvc.perform(get("/api/documents/" + UPLOADED))
                .andExpect(jsonPath("$.source").value("upload"))
                .andExpect(jsonPath("$.pagesWithoutText").value(1));
        mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docId\": \"" + UPLOADED + "\", \"compareDocId\": \"vodafone-20f-fy26\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void deletingAnUploadRemovesItsConversationsButABuiltInReportCannotBeDeleted() throws Exception {
        when(ai.deleteDocument(UPLOADED)).thenReturn(true);
        mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                .content("{\"docId\": \"vodafone-20f-fy26\", \"compareDocId\": \"" + UPLOADED + "\"}"));
        assertThat(conversations.findAll()).anyMatch(c -> UPLOADED.equals(c.getCompareDocId()));

        mvc.perform(delete("/api/documents/" + UPLOADED)).andExpect(status().isNoContent());
        assertThat(conversations.findAll()).noneMatch(c -> UPLOADED.equals(c.getDocId())
                || UPLOADED.equals(c.getCompareDocId()));

        mvc.perform(delete("/api/documents/vodafone-20f-fy26")).andExpect(status().isNotFound());
        verify(ai, never()).deleteDocument(eq("vodafone-20f-fy26"));
    }
}
