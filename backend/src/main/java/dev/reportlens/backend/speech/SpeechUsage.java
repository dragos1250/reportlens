package dev.reportlens.backend.speech;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;

/** Characters sent to ElevenLabs per UTC day (table app.speech_usage). */
@Repository
public class SpeechUsage {

    private final JdbcTemplate jdbc;

    public SpeechUsage(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long on(LocalDate day) {
        Long chars = jdbc.queryForObject("SELECT COALESCE(SUM(chars), 0) FROM app.speech_usage WHERE day = ?",
                Long.class, day);
        return chars == null ? 0 : chars;
    }

    /** From the first day of that month up to and including that day. */
    public long monthUpTo(LocalDate day) {
        Long chars = jdbc.queryForObject(
                "SELECT COALESCE(SUM(chars), 0) FROM app.speech_usage WHERE day BETWEEN ? AND ?",
                Long.class, day.withDayOfMonth(1), day);
        return chars == null ? 0 : chars;
    }

    public void add(LocalDate day, int chars) {
        jdbc.update("INSERT INTO app.speech_usage (day, chars) VALUES (?, ?) "
                + "ON CONFLICT (day) DO UPDATE SET chars = app.speech_usage.chars + EXCLUDED.chars", day, chars);
    }
}
