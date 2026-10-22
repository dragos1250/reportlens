package dev.reportlens.backend.uploads;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Uploading reports (reportlens.uploads.* in application.properties).
 *
 * @param enabled  off unless UPLOADS_ENABLED=true: a public instance stays safe if the variable is missing
 * @param maxMb    largest PDF accepted, checked while the body is read
 * @param perHour  uploads per client IP per hour
 */
@ConfigurationProperties("reportlens.uploads")
public record UploadsProperties(boolean enabled, int maxMb, int perHour) {

    public long maxBytes() {
        return maxMb * 1024L * 1024L;
    }
}
