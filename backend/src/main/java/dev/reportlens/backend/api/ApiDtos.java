package dev.reportlens.backend.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** JSON shapes of the public REST API (camelCase). */
public final class ApiDtos {

    private ApiDtos() {
    }

    public record DocumentDto(String docId, String title, int chunks) {
    }

    public record StartConversation(@NotBlank @Size(max = 200) String docId, @Size(max = 200) String title) {
    }

    public record AskQuestion(@NotBlank @Size(max = 1000) String question,
                              @Pattern(regexp = "^[a-z]{2}$", message = "must be a two-letter code, e.g. ro")
                              String lang) {
    }

    public record ConversationDto(UUID id, String docId, String title, OffsetDateTime createdAt) {
    }

    public record CitationDto(String marker, String docId, int page, String chunkId) {
    }

    public record PassageDto(String marker, String docId, int page, String chunkId, String text, boolean cited) {
    }

    /**
     * For an assistant message, {@code content} is the answer with [P1].. markers and
     * {@code passages} maps each marker to its page and text.
     */
    public record MessageDto(Long id, String role, String content, String lang, String status,
                             List<CitationDto> citations, List<PassageDto> passages, BigDecimal costUsd,
                             String model, OffsetDateTime createdAt) {
    }
}
