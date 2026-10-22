package dev.reportlens.backend.conversation;

/** Text the reader selected in the PDF, with its page (Select & explain). */
public record Selection(int page, String text) {
}
