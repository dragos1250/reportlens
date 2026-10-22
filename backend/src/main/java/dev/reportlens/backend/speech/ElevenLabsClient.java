package dev.reportlens.backend.speech;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.Map;

/**
 * Text to speech with ElevenLabs: POST /v1/text-to-speech/{voice_id}, key in the xi-api-key
 * header, MP3 back. Only the text to read is sent. The key is never logged: a failure is
 * logged with its HTTP status only.
 */
public class ElevenLabsClient {

    private static final Logger log = LoggerFactory.getLogger(ElevenLabsClient.class);
    static final String UNAVAILABLE = "The premium voice is not available right now.";

    private final RestClient http;
    private final SpeechProperties props;

    public ElevenLabsClient(RestClient http, SpeechProperties props) {
        this.http = http;
        this.props = props;
    }

    public byte[] speak(String text, String lang) {
        try {
            byte[] audio = http.post()
                    .uri(uri -> uri.path("/v1/text-to-speech/{voice}").queryParam("output_format", "mp3_44100_128")
                            .build(props.voiceId()))
                    .header("xi-api-key", props.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.valueOf("audio/mpeg"))
                    .body(Map.of("text", text, "model_id", props.model(), "language_code", lang))
                    .retrieve().body(byte[].class);
            if (audio == null || audio.length == 0) {
                throw new SpeechRefusedException(HttpStatus.SERVICE_UNAVAILABLE, UNAVAILABLE);
            }
            return audio;
        } catch (RestClientResponseException e) {
            log.warn("ElevenLabs answered HTTP {}", e.getStatusCode().value());
            throw new SpeechRefusedException(HttpStatus.SERVICE_UNAVAILABLE, UNAVAILABLE);
        } catch (RestClientException e) {
            log.warn("ElevenLabs could not be reached: {}", e.getClass().getSimpleName());
            throw new SpeechRefusedException(HttpStatus.SERVICE_UNAVAILABLE, UNAVAILABLE);
        }
    }
}
