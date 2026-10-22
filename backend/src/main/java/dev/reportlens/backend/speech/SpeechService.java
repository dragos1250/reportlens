package dev.reportlens.backend.speech;

import dev.reportlens.backend.conversation.Conversation;
import dev.reportlens.backend.conversation.ConversationRepository;
import dev.reportlens.backend.conversation.Message;
import dev.reportlens.backend.conversation.MessageRepository;
import dev.reportlens.backend.conversation.NotFoundException;
import dev.reportlens.backend.limits.LimitExceededException;
import dev.reportlens.backend.limits.RateLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Spoken answers with the premium voice. Everything that limits spending happens before the
 * paid call, in this order: the request must be for an answer the server wrote (a message
 * id, never free text), not about an uploaded report, then the per-minute limit, then the
 * daily per-IP, daily global and monthly character caps. Audio already made is replayed
 * from memory without counting again.
 */
@Service
public class SpeechService {

    static final String UPLOADED_REPORT = "Uploaded reports are read with the browser voice only.";
    private static final int CACHED_ANSWERS = 50;

    private record Spend(LocalDate day, long chars) {
    }

    /** Audio and the text and language it was made from. */
    public record Speech(byte[] audio, String text, String lang) {
    }

    private final SpeechProperties props;
    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final ElevenLabsClient elevenLabs;
    private final SpeechUsage usage;
    private final Clock clock;
    private final RateLimiter perMinute;
    private final Map<String, Spend> spendByIp = new HashMap<>();
    private final Map<Long, Speech> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<Long, Speech> eldest) {
            return size() > CACHED_ANSWERS;
        }
    };

    public SpeechService(SpeechProperties props, ConversationRepository conversations, MessageRepository messages,
                         ElevenLabsClient elevenLabs, SpeechUsage usage, Clock clock) {
        this.props = props;
        this.conversations = conversations;
        this.messages = messages;
        this.elevenLabs = elevenLabs;
        this.usage = usage;
        this.clock = clock;
        this.perMinute = new RateLimiter(Math.max(1, props.perMinute()), clock);
    }

    public boolean premiumVoice() {
        return props.enabled();
    }

    public int maxChars() {
        return props.maxChars();
    }

    public Speech speak(UUID conversationId, long messageId, String ip) {
        if (!props.enabled()) {
            throw new NotFoundException("the premium voice is not configured on this server");
        }
        Conversation conversation = conversations.findById(conversationId)
                .orElseThrow(() -> new NotFoundException("unknown conversation: " + conversationId));
        if (conversation.docIds().stream().anyMatch(id -> id.startsWith("upload-"))) {
            throw new SpeechRefusedException(HttpStatus.FORBIDDEN, UPLOADED_REPORT);
        }
        Message message = messages.findById(messageId)
                .filter(m -> "assistant".equals(m.getRole()) && m.belongsTo(conversationId))
                .orElseThrow(() -> new NotFoundException("unknown answer: " + messageId));

        Speech cached = cached(messageId);
        if (cached != null) {
            return cached;
        }
        long wait = perMinute.tryAcquire(ip);
        if (wait > 0) {
            throw new LimitExceededException("Too many spoken answers. Wait a moment; the browser voice is used meanwhile.",
                    wait);
        }
        String text = SpokenText.of(message.getContent(), props.maxChars());
        if (text.isBlank()) {
            throw new SpeechRefusedException(HttpStatus.UNPROCESSABLE_CONTENT, "There is nothing to read.");
        }
        String lang = SpokenText.languageOf(message.getLang(), text);
        checkCaps(ip, text.length());

        byte[] audio = elevenLabs.speak(text, lang);
        record(ip, text.length());
        Speech speech = new Speech(audio, text, lang);
        synchronized (cache) {
            cache.put(messageId, speech);
        }
        return speech;
    }

    private Speech cached(long messageId) {
        synchronized (cache) {
            return cache.get(messageId);
        }
    }

    private void checkCaps(String ip, int chars) {
        LocalDate today = today();
        if (spentToday(ip) + chars > props.perIpDailyChars()) {
            throw new LimitExceededException("Your daily premium voice limit is reached; the browser voice is used instead.",
                    secondsUntil(today.plusDays(1)));
        }
        if (usage.on(today) + chars > props.globalDailyChars()) {
            throw new LimitExceededException("The premium voice's daily limit is reached; the browser voice is used instead.",
                    secondsUntil(today.plusDays(1)));
        }
        if (usage.monthUpTo(today) + chars > props.monthlyChars()) {
            throw new LimitExceededException("The premium voice's monthly limit is reached; the browser voice is used "
                    + "instead.", secondsUntil(today.withDayOfMonth(1).plusMonths(1)));
        }
    }

    private synchronized long spentToday(String ip) {
        Spend spend = spendByIp.get(ip);
        return spend == null || !spend.day().equals(today()) ? 0 : spend.chars();
    }

    private void record(String ip, int chars) {
        usage.add(today(), chars);
        synchronized (this) {
            spendByIp.put(ip, new Spend(today(), spentToday(ip) + chars));
        }
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    private long secondsUntil(LocalDate day) {
        OffsetDateTime now = OffsetDateTime.now(clock.withZone(ZoneOffset.UTC));
        return Math.max(1, Duration.between(now, day.atStartOfDay().atOffset(ZoneOffset.UTC)).toSeconds());
    }
}
