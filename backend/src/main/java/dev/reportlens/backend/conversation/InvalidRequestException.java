package dev.reportlens.backend.conversation;

/** A request that is well formed but does not fit the conversation (answered with 400). */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }
}
