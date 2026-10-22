package dev.reportlens.backend.limits;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/**
 * Token bucket per client: each one holds up to {@code perMinute} tokens, refilled
 * continuously at {@code perMinute} per minute; a request takes one token. Kept in memory:
 * limits reset when the backend restarts, which is fine for one small instance.
 */
public class RateLimiter {

    private static final int MAX_CLIENTS = 10_000;  // past this, forget clients whose bucket is full again

    private record Bucket(double tokens, long atMillis) {
    }

    private final int perMinute;
    private final Clock clock;
    private final Map<String, Bucket> buckets = new HashMap<>();

    public RateLimiter(int perMinute, Clock clock) {
        this.perMinute = perMinute;
        this.clock = clock;
    }

    /** Takes a token for this client. Returns 0 if allowed, else the seconds to wait for one. */
    public synchronized long tryAcquire(String client) {
        long now = clock.millis();
        if (buckets.size() >= MAX_CLIENTS) {
            buckets.entrySet().removeIf(e -> refill(e.getValue(), now) >= perMinute);
        }
        double tokens = buckets.containsKey(client) ? refill(buckets.get(client), now) : perMinute;
        if (tokens >= 1) {
            buckets.put(client, new Bucket(tokens - 1, now));
            return 0;
        }
        buckets.put(client, new Bucket(tokens, now));
        double secondsPerToken = 60.0 / perMinute;
        return (long) Math.ceil((1 - tokens) * secondsPerToken);
    }

    private double refill(Bucket bucket, long now) {
        double added = (now - bucket.atMillis()) / 60_000.0 * perMinute;
        return Math.min(perMinute, bucket.tokens() + added);
    }
}
