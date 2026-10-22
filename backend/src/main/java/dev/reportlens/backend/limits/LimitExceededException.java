package dev.reportlens.backend.limits;

/** A request refused before any LLM call (answered with 429 and Retry-After). */
public class LimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;

    public LimitExceededException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
