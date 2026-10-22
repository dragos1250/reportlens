package dev.reportlens.backend.limits;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Token bucket per client: each one holds up to {@code capacity} tokens, refilled
 * continuously at {@code capacity} per {@code period}; a request takes one token. Kept in
 * memory: limits reset when the backend restarts, which is fine for one small instance.
 * Questions use 10 per minute, uploads 3 per hour.
 */
public class RateLimiter {

    private static final int MAX_CLIENTS = 10_000;  // past this, forget clients whose bucket is full again

    private record Bucket(double tokens, long atMillis) {
    }

    private final int capacity;
    private final long periodMillis;
    private final Clock clock;
    private final Map<String, Bucket> buckets = new HashMap<>();

    public RateLimiter(int perMinute, Clock clock) {
        this(perMinute, Duration.ofMinutes(1), clock);
    }

    public RateLimiter(int capacity, Duration period, Clock clock) {
        this.capacity = capacity;
        this.periodMillis = period.toMillis();
        this.clock = clock;
    }

    /** Takes a token for this client. Returns 0 if allowed, else the seconds to wait for one. */
    public synchronized long tryAcquire(String client) {
        long now = clock.millis();
        if (buckets.size() >= MAX_CLIENTS) {
            buckets.entrySet().removeIf(e -> refill(e.getValue(), now) >= capacity);
        }
        double tokens = buckets.containsKey(client) ? refill(buckets.get(client), now) : capacity;
        if (tokens >= 1) {
            buckets.put(client, new Bucket(tokens - 1, now));
            return 0;
        }
        buckets.put(client, new Bucket(tokens, now));
        double secondsPerToken = periodMillis / 1000.0 / capacity;
        return (long) Math.ceil((1 - tokens) * secondsPerToken);
    }

    private double refill(Bucket bucket, long now) {
        double added = (double) (now - bucket.atMillis()) / periodMillis * capacity;
        return Math.min(capacity, bucket.tokens() + added);
    }
}
