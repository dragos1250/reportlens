package dev.reportlens.backend.ai;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.List;

/** JSON shapes of the FastAPI service (snake_case on the wire). */
public final class AiDtos {

    private AiDtos() {
    }

    /** source: "builtin" (listed) or "upload" (unlisted, expires). */
    public record Document(@JsonProperty("doc_id") String docId, String title, int chunks, String source,
                           Integer pages, @JsonProperty("pages_without_text") Integer pagesWithoutText,
                           @JsonProperty("expires_at") OffsetDateTime expiresAt) {

        public Document {
            source = source == null ? "builtin" : source;  // an older AI service sends no source
        }

        public Document(String docId, String title, int chunks) {
            this(docId, title, chunks, "builtin", null, null, null);
        }
    }

    public record UploadAccepted(@JsonProperty("job_id") String jobId, @JsonProperty("doc_id") String docId,
                                 String title, String state) {
    }

    /** state: queued | reading | indexing | ready | failed (error says why and what to do). */
    public record UploadJob(String id, @JsonProperty("doc_id") String docId, String title, String state, String step,
                            int done, int total, String error,
                            @JsonProperty("queue_position") Integer queuePosition) {
    }

    /** FastAPI's error body: {"detail": "..."}. */
    public record ErrorDetail(String detail) {
    }

    public record AskRequest(String question, @JsonProperty("doc_id") String docId, String lang) {
    }

    /** Compare two reports: each is searched separately; the answer cites both. */
    public record CompareRequest(String question, @JsonProperty("doc_ids") List<String> docIds, String lang) {
    }

    /**
     * status: answered | partial | not_found | not_in_report | incomplete | invalid_output.
     * {@code missingDocIds}: the reports that do not cover the question.
     */
    public record CompareResponse(String status, String answer, @JsonProperty("answer_marked") String answerMarked,
                                  List<Citation> citations, List<Passage> passages, String model,
                                  @JsonProperty("cost_usd") Double costUsd,
                                  @JsonProperty("missing_doc_ids") List<String> missingDocIds) {
    }

    /** Select & explain: only the selected text is sent, no search. */
    public record ExplainRequest(@JsonProperty("doc_id") String docId, int page, String text, String question,
                                 String lang) {
    }

    /** status: explained | not_enough | too_short | too_long | no_text | incomplete | invalid_output. */
    public record ExplainResponse(String status, String answer, int page, String quote, String model,
                                  @JsonProperty("cost_usd") Double costUsd) {
    }

    public record Citation(String marker, @JsonProperty("doc_id") String docId, int page,
                           @JsonProperty("chunk_id") String chunkId) {
    }

    public record Passage(String marker, @JsonProperty("doc_id") String docId, int page,
                          @JsonProperty("chunk_id") String chunkId, String text, boolean cited) {
    }

    /**
     * Only the fields the backend uses; the service sends more (usage, timings, ...).
     * {@code answerMarked} is the answer with the model's [P1].. markers, which the UI turns
     * into clickable citations using {@code passages}.
     */
    public record AskResponse(String status, String answer, @JsonProperty("answer_marked") String answerMarked,
                              List<Citation> citations, List<Passage> passages,
                              String model, @JsonProperty("cost_usd") Double costUsd) {
    }
}
