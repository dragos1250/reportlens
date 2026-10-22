package dev.reportlens.backend.limits;

import dev.reportlens.backend.TestcontainersConfiguration;
import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.ai.AiServiceClient;
import dev.reportlens.backend.conversation.MessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usage limits through the real controller and database, with small limits: 2 questions
 * per minute per IP, $0.05 per IP and $1.00 for everyone per day. nginx is 10.0.0.5.
 */
@SpringBootTest(properties = {
        "reportlens.limits.requests-per-minute=2",
        "reportlens.limits.per-ip-daily-usd=0.05",
        "reportlens.limits.global-daily-usd=1.00",
        "reportlens.limits.trusted-proxies=10.0.0.5",
})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class LimitsIntegrationTest {

    private static final String DOC = "vodafone-20f-fy26";
    private static final String PROXY = "10.0.0.5";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private MessageRepository messages;

    @MockitoBean
    private AiServiceClient ai;

    private String conversation;

    @BeforeEach
    void setUp() throws Exception {
        messages.deleteAll();  // today's global cost starts at zero in every test
        when(ai.documents()).thenReturn(List.of(new AiDtos.Document(DOC, "Vodafone", 1)));
        answerCosting(0.0001);
        String body = mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                .content("{\"docId\": \"" + DOC + "\"}")).andReturn().getResponse().getContentAsString();
        conversation = json.readTree(body).get("id").asString();
    }

    private void answerCosting(double costUsd) {
        when(ai.ask(any())).thenReturn(new AiDtos.AskResponse("answered", "a", "a [P1].", List.of(), List.of(),
                "gpt-6-luna", costUsd));
    }

    /** A question as it reaches the backend: from remoteAddr, with an optional X-Forwarded-For. */
    private ResultActions ask(String remoteAddr, String forwardedFor) throws Exception {
        var request = post("/api/conversations/" + conversation + "/messages")
                .contentType(MediaType.APPLICATION_JSON).content("{\"question\": \"Revenue?\"}")
                .with(r -> {
                    r.setRemoteAddr(remoteAddr);
                    return r;
                });
        if (forwardedFor != null) {
            request.header("X-Forwarded-For", forwardedFor);
        }
        return mvc.perform(request);
    }

    @Test
    void thePerMinuteLimitAnswers429WithRetryAfterAndNeverCallsTheLlm() throws Exception {
        ask("198.51.100.1", null).andExpect(status().isCreated());
        ask("198.51.100.1", null).andExpect(status().isCreated());
        ask("198.51.100.1", null)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "30"))
                .andExpect(jsonPath("$.detail").value("Too many questions. Wait a moment, then ask again."));
        verify(ai, times(2)).ask(any());
        // The refused question is not stored either.
        mvc.perform(get("/api/conversations/" + conversation + "/messages"))
                .andExpect(jsonPath("$.length()").value(4));
    }

    @Test
    void differentClientsBehindTheProxyHaveSeparateLimits() throws Exception {
        ask(PROXY, "203.0.113.1").andExpect(status().isCreated());
        ask(PROXY, "203.0.113.1").andExpect(status().isCreated());
        ask(PROXY, "203.0.113.1").andExpect(status().isTooManyRequests());
        ask(PROXY, "203.0.113.2").andExpect(status().isCreated());
    }

    @Test
    void aForgedForwardedForFromOutsideTheProxyIsIgnored() throws Exception {
        // A client that sends a new fake address each time is still limited by its own address.
        ask("198.51.100.9", "203.0.113.50").andExpect(status().isCreated());
        ask("198.51.100.9", "203.0.113.51").andExpect(status().isCreated());
        ask("198.51.100.9", "203.0.113.52").andExpect(status().isTooManyRequests());
    }

    @Test
    void theDailyCostPerIpStopsThatClientOnly() throws Exception {
        answerCosting(0.06);
        ask(PROXY, "203.0.113.20").andExpect(status().isCreated());
        ask(PROXY, "203.0.113.20")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.detail").value(
                        "The daily question budget for your address is used up. Try again tomorrow."));
        answerCosting(0.0001);
        ask(PROXY, "203.0.113.21").andExpect(status().isCreated());
    }

    @Test
    void aSelectionOver5000CharactersIsRefusedBeforeAnyWork() throws Exception {
        mvc.perform(post("/api/conversations/" + conversation + "/messages").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"selection\": {\"page\": 3, \"text\": \"" + "a".repeat(5001) + "\"}}"))
                .andExpect(status().isBadRequest());
        verify(ai, times(0)).explain(any());
    }

    @Test
    void onlyTheHealthEndpointIsExposedWithoutDetails() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist());
        mvc.perform(get("/actuator/env")).andExpect(status().isNotFound());
    }

    @Test
    void theGlobalDailyCostStopsEveryone() throws Exception {
        answerCosting(1.50);
        ask(PROXY, "203.0.113.30").andExpect(status().isCreated());
        ask(PROXY, "203.0.113.31")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.detail").value("The assistant's daily budget is used up. Try again tomorrow."));
    }
}
