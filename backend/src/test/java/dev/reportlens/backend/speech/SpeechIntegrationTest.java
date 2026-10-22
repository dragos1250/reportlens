package dev.reportlens.backend.speech;

import dev.reportlens.backend.TestcontainersConfiguration;
import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.ai.AiServiceClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The speech endpoint with ElevenLabs simulated and small limits: 2 per minute per IP,
 * 60 characters per IP per day, 100 per day overall, 150 per month.
 */
@SpringBootTest(properties = {
        "reportlens.speech.api-key=test-key",
        "reportlens.speech.voice-id=voice1",
        "reportlens.speech.per-minute=2",
        "reportlens.speech.per-ip-daily-chars=60",
        "reportlens.speech.global-daily-chars=100",
        "reportlens.speech.monthly-chars=150",
        "reportlens.limits.requests-per-minute=1000",
})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SpeechIntegrationTest {

    private static final String DOC = "vodafone-20f-fy26";
    private static final String UPLOADED = "upload-" + "b".repeat(32);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private AiServiceClient ai;

    @MockitoBean
    private ElevenLabsClient elevenLabs;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM app.speech_usage");
        when(ai.document(DOC)).thenReturn(Optional.of(new AiDtos.Document(DOC, "Vodafone", 1)));
        when(ai.document(UPLOADED)).thenReturn(Optional.of(new AiDtos.Document(UPLOADED, "Mine", 1, "upload", 3, 0, null)));
        when(elevenLabs.speak(anyString(), anyString())).thenReturn(new byte[]{9, 9});
    }

    /** A new conversation about docId with one answer; returns {conversationId, messageId}. */
    private String[] answer(String docId, String content, String lang) throws Exception {
        when(ai.ask(any())).thenReturn(new AiDtos.AskResponse("answered", content, content, List.of(), List.of(),
                "gpt-6-luna", 0.0001));
        String conversation = json.readTree(mvc.perform(post("/api/conversations")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"docId\": \"" + docId + "\"}"))
                .andReturn().getResponse().getContentAsString()).get("id").asString();
        String body = "{\"question\": \"q\"" + (lang == null ? "" : ", \"lang\": \"" + lang + "\"") + "}";
        JsonNode message = json.readTree(mvc.perform(post("/api/conversations/" + conversation + "/messages")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getContentAsString());
        return new String[]{conversation, message.get("id").asString()};
    }

    private ResultActions speak(String[] answer, String ip) throws Exception {
        return mvc.perform(post("/api/conversations/" + answer[0] + "/messages/" + answer[1] + "/speech")
                .with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                }));
    }

    @Test
    void answersCarryTheirSpokenTextAndLanguageEvenWithAuto() throws Exception {
        String[] romanian = answer(DOC, "Veniturile au crescut cu 8% [P1]. Datoria a scăzut [P2].", null);
        mvc.perform(get("/api/conversations/" + romanian[0] + "/messages"))
                .andExpect(jsonPath("$[0].spokenText").doesNotExist())  // the question is not read
                .andExpect(jsonPath("$[1].spokenText").value("Veniturile au crescut cu 8%. Datoria a scăzut."))
                .andExpect(jsonPath("$[1].spokenLang").value("ro"));

        String[] english = answer(DOC, "Revenue grew [P1].", "ro");
        mvc.perform(get("/api/conversations/" + english[0] + "/messages"))
                .andExpect(jsonPath("$[1].spokenLang").value("ro"));  // the requested language wins
    }

    @Test
    void anAnswerIsReadWithoutItsMarkersAndReplayedFromMemory() throws Exception {
        String[] a = answer(DOC, "Revenue grew 8.0% [P2]. The report says so [P1].", null);
        speak(a, "198.51.100.10")
                .andExpect(status().isOk())
                .andExpect(content().contentType("audio/mpeg"))
                .andExpect(header().string("Content-Language", "en"))
                .andExpect(content().bytes(new byte[]{9, 9}));
        speak(a, "198.51.100.10").andExpect(status().isOk());
        verify(elevenLabs, times(1)).speak("Revenue grew 8.0%. The report says so.", "en");
        assertUsage(38);  // counted once
    }

    @Test
    void thePerMinuteLimitIs429() throws Exception {
        speak(answer(DOC, "One.", null), "198.51.100.11").andExpect(status().isOk());
        speak(answer(DOC, "Two.", null), "198.51.100.11").andExpect(status().isOk());
        speak(answer(DOC, "Three.", null), "198.51.100.11")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }

    @Test
    void theDailyCapPerIpThenTheGlobalOneThenTheMonthlyOne() throws Exception {
        String fifty = "A sentence that is exactly fifty characters long.";  // 50
        speak(answer(DOC, fifty, null), "198.51.100.12").andExpect(status().isOk());
        speak(answer(DOC, "Twenty characters!!", null), "198.51.100.12")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.detail").value(
                        "Your daily premium voice limit is reached; the browser voice is used instead."));

        speak(answer(DOC, fifty, null), "198.51.100.13").andExpect(status().isOk());  // 100 today overall
        speak(answer(DOC, "Short.", null), "198.51.100.14")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.detail").value(
                        "The premium voice's daily limit is reached; the browser voice is used instead."));

        // Earlier this month (on the 1st, today itself would also hit the daily cap first).
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        assumeTrue(today.getDayOfMonth() > 1, "needs an earlier day in this month");
        jdbc.update("DELETE FROM app.speech_usage");
        jdbc.update("INSERT INTO app.speech_usage (day, chars) VALUES (?, 148)", today.withDayOfMonth(1));
        speak(answer(DOC, "Short.", null), "198.51.100.15")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.detail").value(
                        "The premium voice's monthly limit is reached; the browser voice is used instead."));
    }

    @Test
    void anUploadedReportIsNeverSentToTheExternalService() throws Exception {
        speak(answer(UPLOADED, "Revenue grew.", null), "198.51.100.16")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Uploaded reports are read with the browser voice only."));
        verify(elevenLabs, never()).speak(anyString(), anyString());
    }

    @Test
    void theConfigSaysThePremiumVoiceIsAvailable() throws Exception {
        mvc.perform(get("/api/config")).andExpect(jsonPath("$.premiumVoice").value(true));
    }

    private void assertUsage(int chars) {
        Integer used = jdbc.queryForObject("SELECT chars FROM app.speech_usage WHERE day = ?", Integer.class,
                LocalDate.now(ZoneOffset.UTC));
        assertThat(used).isEqualTo(chars);
    }
}
