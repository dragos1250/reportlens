package dev.reportlens.backend.limits;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimiterTest {

    /** A clock the test moves by hand. */
    private static final class ManualClock extends Clock {
        private Instant now = Instant.parse("2026-10-22T10:00:00Z");

        void advanceSeconds(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }

    @Test
    void allowsTheLimitThenAsksToWaitForTheNextToken() {
        var clock = new ManualClock();
        var limiter = new RateLimiter(10, clock);
        for (int i = 0; i < 10; i++) {
            assertThat(limiter.tryAcquire("1.1.1.1")).isZero();
        }
        assertThat(limiter.tryAcquire("1.1.1.1")).isEqualTo(6);  // one token every 6 s at 10 per minute

        clock.advanceSeconds(6);
        assertThat(limiter.tryAcquire("1.1.1.1")).isZero();
    }

    @Test
    void eachClientHasItsOwnBucket() {
        var limiter = new RateLimiter(1, new ManualClock());
        assertThat(limiter.tryAcquire("1.1.1.1")).isZero();
        assertThat(limiter.tryAcquire("1.1.1.1")).isPositive();
        assertThat(limiter.tryAcquire("2.2.2.2")).isZero();
    }

    @Test
    void forwardedForIsReadOnlyFromATrustedProxy() {
        Set<String> trusted = Set.of("172.30.0.10");
        assertThat(ClientIp.resolve("172.30.0.10", "203.0.113.7", trusted)).isEqualTo("203.0.113.7");
        // Anyone else can send the header: it is ignored.
        assertThat(ClientIp.resolve("198.51.100.1", "203.0.113.7", trusted)).isEqualTo("198.51.100.1");
        // From the proxy, the last hop is the address the proxy saw.
        assertThat(ClientIp.resolve("172.30.0.10", "10.9.9.9, 203.0.113.7", trusted)).isEqualTo("203.0.113.7");
        assertThat(ClientIp.resolve("172.30.0.10", null, trusted)).isEqualTo("172.30.0.10");
        assertThat(ClientIp.resolve("172.30.0.10", "203.0.113.7", Set.of())).isEqualTo("172.30.0.10");
    }
}
