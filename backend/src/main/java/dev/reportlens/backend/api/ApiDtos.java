package dev.reportlens.backend.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
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

    /** source: "builtin" or "upload"; pagesWithoutText: scanned pages, neither searched nor cited. */
    public record DocumentDto(String docId, String title, int chunks, String source, Integer pages,
                              Integer pagesWithoutText, OffsetDateTime expiresAt) {
    }

    /** What the browser needs to know about this server. */
    /** premiumVoice: ElevenLabs is configured on this server (the browser voice always works). */
    public record ConfigDto(boolean uploadsEnabled, int maxUploadMb, boolean premiumVoice) {
    }

    public record UploadAcceptedDto(String jobId, String docId, String title, String state) {
    }

    public record UploadJobDto(String jobId, String docId, String title, String state, String step, int done,
                               int total, String error, Integer queuePosition) {
    }

    /** compareDocId (optional): the second report; every question then compares the two. */
    public record StartConversation(@NotBlank @Size(max = 200) String docId, @Size(max = 200) String compareDocId,
                                    @Size(max = 200) String title) {
    }

    /**
     * The reader's selection. 5,000 characters, above the AI service's 2,000, so a slightly long
     * selection still gets a calm "too long" answer, while a huge one is refused here.
     * docId (optional): which report of a comparison it comes from; default the conversation's.
     */
    public record SelectionDto(@Size(max = 200) String docId, @Min(1) int page,
                               @NotBlank @Size(max = 5000) String text) {
    }

    /**
     * A question, a selection ("Explain this"), or both ("Ask about this"). At least one of
     * question and selection is required.
     */
    public record AskQuestion(@Size(max = 1000) String question,
                              @Pattern(regexp = "^[a-z]{2}$", message = "must be a two-letter code, e.g. ro")
                              String lang,
                              @Valid SelectionDto selection) {

        @AssertTrue(message = "a question or a selection is required")
        public boolean isQuestionOrSelection() {
            return selection != null || (question != null && !question.isBlank());
        }
    }

    public record ConversationDto(UUID id, String docId, String compareDocId, String title,
                                  OffsetDateTime createdAt) {
    }

    public record CitationDto(String marker, String docId, int page, String chunkId) {
    }

    public record PassageDto(String marker, String docId, int page, String chunkId, String text, boolean cited) {
    }

    /**
     * For an assistant message, {@code content} is the answer with [P1].. markers and
     * {@code passages} maps each marker to its page and text.
     */
    /**
     * spokenText / spokenLang (answers only): what "Read aloud" reads, without the [P#] markers,
     * and its language ("ro" or "en"), resolved on the server even when the question used "Auto".
     */
    public record MessageDto(Long id, String role, String content, String lang, String status,
                             List<CitationDto> citations, List<PassageDto> passages, BigDecimal costUsd,
                             String model, SelectionDto selection, OffsetDateTime createdAt,
                             String spokenText, String spokenLang) {
    }
}
