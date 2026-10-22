package dev.reportlens.backend.conversation;

/**
 * Text the reader selected in the PDF, with its page (Select & explain). docId says which
 * report it comes from when a conversation compares two; null means the conversation's own.
 */
public record Selection(String docId, int page, String text) {

    public Selection(int page, String text) {
        this(null, page, text);
    }
}
