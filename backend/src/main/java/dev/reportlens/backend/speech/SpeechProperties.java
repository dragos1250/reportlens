package dev.reportlens.backend.speech;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Spoken answers with ElevenLabs (reportlens.speech.* in application.properties). Off unless
 * both the API key and a voice id are set; the browser voice works without any of this.
 *
 * @param apiKey           ELEVENLABS_API_KEY; never logged (see toString)
 * @param voiceId          ELEVENLABS_VOICE_ID
 * @param model            ELEVENLABS_MODEL, default eleven_flash_v2_5 (supports Romanian, half the
 *                         price of the multilingual models, accepts language_code)
 * @param baseUrl          the ElevenLabs API; replaced in tests
 * @param maxChars         characters read per answer
 * @param perMinute        speech requests per client IP per minute
 * @param perIpDailyChars  characters per client IP per UTC day
 * @param globalDailyChars characters for everyone per UTC day
 * @param monthlyChars     characters for everyone per calendar month (UTC); keep it under the plan's quota
 */
@ConfigurationProperties("reportlens.speech")
public record SpeechProperties(String apiKey, String voiceId, String model, String baseUrl, int maxChars,
                               int perMinute, int perIpDailyChars, int globalDailyChars, int monthlyChars) {

    public boolean enabled() {
        return apiKey != null && !apiKey.isBlank() && voiceId != null && !voiceId.isBlank();
    }

    @Override
    public String toString() {
        return "SpeechProperties[enabled=" + enabled() + ", model=" + model + ", maxChars=" + maxChars + "]";
    }
}
