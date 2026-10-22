package dev.reportlens.backend.uploads;

import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.ai.AiServiceClient;
import dev.reportlens.backend.conversation.ConversationRepository;
import dev.reportlens.backend.conversation.NotFoundException;
import dev.reportlens.backend.limits.LimitExceededException;
import dev.reportlens.backend.limits.RateLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Uploads go through here before the AI service: the feature switch, the limits per client
 * IP (uploads per hour, one at a time) and the size limit, checked while the body is read.
 * The checks on the file itself (real PDF, pages, text layer) are in the AI service.
 */
@Service
public class UploadService {

    private static final Set<String> ACTIVE = Set.of("queued", "reading", "indexing");

    private final UploadsProperties props;
    private final AiServiceClient ai;
    private final ConversationRepository conversations;
    private final RateLimiter perHour;
    private final Map<String, String> lastJobByIp = new ConcurrentHashMap<>();

    public UploadService(UploadsProperties props, AiServiceClient ai, ConversationRepository conversations,
                         Clock clock) {
        this.props = props;
        this.ai = ai;
        this.conversations = conversations;
        this.perHour = new RateLimiter(Math.max(1, props.perHour()), Duration.ofHours(1), clock);
    }

    public boolean enabled() {
        return props.enabled();
    }

    public int maxMb() {
        return props.maxMb();
    }

    public AiDtos.UploadAccepted upload(String ip, InputStream body, String filename) {
        requireEnabled();
        String last = lastJobByIp.get(ip);
        if (last != null && ai.uploadJob(last).map(job -> ACTIVE.contains(job.state())).orElse(false)) {
            throw new LimitExceededException("Your previous upload is still being processed. "
                    + "Wait until it is ready, then upload the next one.", 10);
        }
        long wait = perHour.tryAcquire(ip);
        if (wait > 0) {
            throw new LimitExceededException("Uploads are limited to " + props.perHour()
                    + " per hour. Try again later.", wait);
        }
        byte[] pdf = readAtMost(body, props.maxBytes());
        AiDtos.UploadAccepted accepted = ai.upload(pdf, filename == null ? "" : filename);
        lastJobByIp.put(ip, accepted.jobId());
        return accepted;
    }

    public AiDtos.UploadJob job(String jobId) {
        requireEnabled();
        return ai.uploadJob(jobId).orElseThrow(() -> new NotFoundException("unknown upload: " + jobId));
    }

    public Optional<AiDtos.Document> document(String docId) {
        return ai.document(docId);
    }

    /** Deletes an uploaded report: its conversations here, then the document, chunks and file. */
    public void delete(String docId) {
        requireEnabled();
        if (!docId.startsWith("upload-") || ai.document(docId).isEmpty()) {
            throw new NotFoundException("no uploaded document: " + docId);
        }
        conversations.deleteByDocument(docId);
        if (!ai.deleteDocument(docId)) {
            throw new NotFoundException("no uploaded document: " + docId);
        }
    }

    private void requireEnabled() {
        if (!props.enabled()) {
            throw new NotFoundException("uploads are not enabled on this server");
        }
    }

    /** Reads the body but never more than the limit plus one byte, so a huge body is refused early. */
    static byte[] readAtMost(InputStream body, long maxBytes) {
        try (body) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            long total = 0;
            for (int n; (n = body.read(buffer)) != -1; ) {
                total += n;
                if (total > maxBytes) {
                    throw new UploadRejectedException(HttpStatus.CONTENT_TOO_LARGE,
                            "The file is larger than " + maxBytes / (1024 * 1024) + " MB.");
                }
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
