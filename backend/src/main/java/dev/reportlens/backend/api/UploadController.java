package dev.reportlens.backend.api;

import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.api.ApiDtos.ConfigDto;
import dev.reportlens.backend.api.ApiDtos.DocumentDto;
import dev.reportlens.backend.api.ApiDtos.UploadAcceptedDto;
import dev.reportlens.backend.api.ApiDtos.UploadJobDto;
import dev.reportlens.backend.conversation.NotFoundException;
import dev.reportlens.backend.limits.UsageLimits;
import dev.reportlens.backend.speech.SpeechService;
import dev.reportlens.backend.uploads.UploadService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Uploading a report. The browser sends the PDF as the raw request body (application/pdf),
 * with its name URL-encoded in X-Filename: no multipart parsing, and the size limit is
 * checked while the bytes are read. Ingestion runs in the background; the browser polls
 * the job every second.
 */
@RestController
@RequestMapping("/api")
public class UploadController {

    private final UploadService uploads;
    private final UsageLimits limits;
    private final SpeechService speech;

    public UploadController(UploadService uploads, UsageLimits limits, SpeechService speech) {
        this.uploads = uploads;
        this.limits = limits;
        this.speech = speech;
    }

    /** What this server offers: uploads and the premium voice are both optional. */
    @GetMapping("/config")
    public ConfigDto config() {
        return new ConfigDto(uploads.enabled(), uploads.maxMb(), speech.premiumVoice());
    }

    @PostMapping(value = "/uploads", consumes = "application/pdf")
    public ResponseEntity<UploadAcceptedDto> upload(HttpServletRequest http,
                                                    @RequestHeader(value = "X-Filename", required = false) String filename)
            throws IOException {
        String ip = limits.clientIp(http.getRemoteAddr(), http.getHeader("X-Forwarded-For"));
        String name = filename == null ? "" : URLDecoder.decode(filename, StandardCharsets.UTF_8);
        AiDtos.UploadAccepted accepted = uploads.upload(ip, http.getInputStream(), name);
        return ResponseEntity.accepted().location(URI.create("/api/uploads/" + accepted.jobId()))
                .body(new UploadAcceptedDto(accepted.jobId(), accepted.docId(), accepted.title(), accepted.state()));
    }

    @GetMapping("/uploads/{jobId}")
    public UploadJobDto job(@PathVariable String jobId) {
        AiDtos.UploadJob job = uploads.job(jobId);
        return new UploadJobDto(job.id(), job.docId(), job.title(), job.state(), job.step(), job.done(), job.total(),
                job.error(), job.queuePosition());
    }

    /** Any document by id: built-in or uploaded (uploads are unlisted, so they open by id only). */
    @GetMapping("/documents/{docId}")
    public DocumentDto document(@PathVariable String docId) {
        return uploads.document(docId).map(ApiController::toDto)
                .orElseThrow(() -> new NotFoundException("unknown document: " + docId));
    }

    @DeleteMapping("/documents/{docId}")
    public ResponseEntity<Void> delete(@PathVariable String docId) {
        uploads.delete(docId);
        return ResponseEntity.noContent().build();
    }
}
