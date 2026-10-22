package dev.reportlens.backend.limits;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.util.List;

/**
 * Protections for the LLM route (reportlens.limits.* in application.properties, or the
 * environment variables named there).
 *
 * @param requestsPerMinute questions per client IP per minute
 * @param perIpDailyUsd     estimated LLM cost per client IP per UTC day
 * @param globalDailyUsd    estimated LLM cost for everyone per UTC day
 * @param trustedProxies    addresses whose X-Forwarded-For header is believed (nginx in Docker)
 */
@ConfigurationProperties("reportlens.limits")
public record LimitsProperties(int requestsPerMinute, BigDecimal perIpDailyUsd, BigDecimal globalDailyUsd,
                               List<String> trustedProxies) {

    public LimitsProperties {
        trustedProxies = trustedProxies == null ? List.of()
                : trustedProxies.stream().map(String::strip).filter(s -> !s.isEmpty()).toList();
    }
}
