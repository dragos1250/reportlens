package dev.reportlens.backend.api;

import dev.reportlens.backend.limits.UsageLimits;
import dev.reportlens.backend.speech.SpeechService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * An answer read aloud with the premium voice. The request names an answer the server
 * wrote, never a text, so this endpoint cannot be used to have any text spoken at our cost.
 */
@RestController
@RequestMapping("/api")
public class SpeechController {

    private final SpeechService speech;
    private final UsageLimits limits;

    public SpeechController(SpeechService speech, UsageLimits limits) {
        this.speech = speech;
        this.limits = limits;
    }

    @PostMapping("/conversations/{id}/messages/{messageId}/speech")
    public ResponseEntity<byte[]> speak(@PathVariable UUID id, @PathVariable long messageId, HttpServletRequest http) {
        String ip = limits.clientIp(http.getRemoteAddr(), http.getHeader("X-Forwarded-For"));
        SpeechService.Speech spoken = speech.speak(id, messageId, ip);
        return ResponseEntity.ok().contentType(MediaType.valueOf("audio/mpeg"))
                .cacheControl(CacheControl.noStore())
                .header("Content-Language", spoken.lang())
                .body(spoken.audio());
    }
}
