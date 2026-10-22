package dev.reportlens.backend.limits;

import dev.reportlens.backend.conversation.MessageRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Checked before every question that may call the LLM: questions per minute per IP, then
 * the estimated cost so far today (UTC), per IP and for everyone. The global total comes
 * from the database (cost_usd of today's answers), so it survives restarts; the per-IP
 * total is kept in memory. A question already running can take a total slightly past a
 * cap: the cost is known only after the answer.
 */
@Service
public class UsageLimits {

    private record Spend(LocalDate day, BigDecimal usd) {
    }

    private final LimitsProperties limits;
    private final MessageRepository messages;
    private final Clock clock;
    private final RateLimiter rate;
    private final Set<String> trustedProxies;
    private final Map<String, Spend> spendByIp = new HashMap<>();

    public UsageLimits(LimitsProperties limits, MessageRepository messages, Clock clock) {
        this.limits = limits;
        this.messages = messages;
        this.clock = clock;
        this.rate = new RateLimiter(limits.requestsPerMinute(), clock);
        this.trustedProxies = new HashSet<>(limits.trustedProxies());
    }

    public String clientIp(String remoteAddr, String forwardedFor) {
        return ClientIp.resolve(remoteAddr, forwardedFor, trustedProxies);
    }

    /** Throws LimitExceededException if this client may not ask now. */
    public void check(String ip) {
        long wait = rate.tryAcquire(ip);
        if (wait > 0) {
            throw new LimitExceededException("Too many questions. Wait a moment, then ask again.", wait);
        }
        if (spentToday(ip).compareTo(limits.perIpDailyUsd()) >= 0) {
            throw new LimitExceededException("The daily question budget for your address is used up. "
                    + "Try again tomorrow.", secondsToMidnight());
        }
        BigDecimal global = messages.sumCostSince(startOfDay().toOffsetDateTime());
        if (global != null && global.compareTo(limits.globalDailyUsd()) >= 0) {
            throw new LimitExceededException("The assistant's daily budget is used up. Try again tomorrow.",
                    secondsToMidnight());
        }
    }

    /** Adds an answer's estimated cost to this client's total for today. */
    public synchronized void record(String ip, BigDecimal costUsd) {
        if (costUsd == null || costUsd.signum() <= 0) {
            return;
        }
        spendByIp.put(ip, new Spend(today(), spentToday(ip).add(costUsd)));
    }

    private synchronized BigDecimal spentToday(String ip) {
        Spend spend = spendByIp.get(ip);
        if (spend == null || !spend.day().equals(today())) {
            return BigDecimal.ZERO;
        }
        return spend.usd();
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    private ZonedDateTime startOfDay() {
        return today().atStartOfDay(ZoneOffset.UTC);
    }

    private long secondsToMidnight() {
        OffsetDateTime now = OffsetDateTime.now(clock.withZone(ZoneOffset.UTC));
        return Math.max(1, Duration.between(now, startOfDay().plusDays(1).toOffsetDateTime()).toSeconds());
    }
}
