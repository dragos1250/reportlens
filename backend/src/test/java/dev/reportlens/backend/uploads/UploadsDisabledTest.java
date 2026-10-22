package dev.reportlens.backend.uploads;

import dev.reportlens.backend.TestcontainersConfiguration;
import dev.reportlens.backend.ai.AiServiceClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Without UPLOADS_ENABLED (the default in code): no upload route works, as on a public instance. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UploadsDisabledTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AiServiceClient ai;

    @Test
    void uploadsAreOffByDefault() throws Exception {
        mvc.perform(get("/api/config")).andExpect(jsonPath("$.uploadsEnabled").value(false));
        mvc.perform(post("/api/uploads").contentType(MediaType.APPLICATION_PDF).content("%PDF-1.4".getBytes()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/uploads/job1")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/documents/upload-" + "a".repeat(32))).andExpect(status().isNotFound());
        verify(ai, never()).upload(any(), anyString());
    }
}
