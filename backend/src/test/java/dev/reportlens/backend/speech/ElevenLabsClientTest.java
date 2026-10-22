package dev.reportlens.backend.speech;

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
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** ElevenLabs simulated: no real call, no real key. */
class ElevenLabsClientTest {

    private static final SpeechProperties PROPS = new SpeechProperties("test-key", "voice1", "eleven_flash_v2_5",
            "http://tts.test", 400, 5, 2000, 20000, 8000);

    private MockRestServiceServer server;
    private ElevenLabsClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(PROPS.baseUrl());
        server = MockRestServiceServer.bindTo(builder).build();
        client = new ElevenLabsClient(builder.build(), PROPS);
    }

    @Test
    void sendsOnlyTheTextWithTheKeyHeaderModelAndLanguage() {
        server.expect(requestTo("http://tts.test/v1/text-to-speech/voice1?output_format=mp3_44100_128"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("xi-api-key", "test-key"))
                .andExpect(content().json("""
                        {"text": "Veniturile au crescut.", "model_id": "eleven_flash_v2_5", "language_code": "ro"}
                        """, true))
                .andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.valueOf("audio/mpeg")));

        assertThat(client.speak("Veniturile au crescut.", "ro")).containsExactly(1, 2, 3);
        server.verify();
    }

    @Test
    void aRefusalOrOutageBecomesAClearUnavailableMessage() {
        server.expect(requestTo("http://tts.test/v1/text-to-speech/voice1?output_format=mp3_44100_128"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.speak("x", "en"))
                .isInstanceOf(SpeechRefusedException.class)
                .hasMessage("The premium voice is not available right now.");
    }

    @Test
    void theKeyNeverAppearsInTheSettingsText() {
        assertThat(PROPS.toString()).doesNotContain("test-key").contains("enabled=true");
    }
}
