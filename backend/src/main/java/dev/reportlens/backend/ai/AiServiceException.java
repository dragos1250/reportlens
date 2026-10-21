package dev.reportlens.backend.ai;

/** The AI service could not be reached or answered with an error. */
public class AiServiceException extends RuntimeException {

    public AiServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
