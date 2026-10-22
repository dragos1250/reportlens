package dev.reportlens.backend.ai;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/** JSON shapes of the FastAPI service (snake_case on the wire). */
public final class AiDtos {

    private AiDtos() {
    }

    public record Document(@JsonProperty("doc_id") String docId, String title, int chunks) {
    }

    public record AskRequest(String question, @JsonProperty("doc_id") String docId, String lang) {
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
