package dev.reportlens.backend.uploads;

import org.springframework.http.HttpStatus;

/** The upload cannot be used (not a PDF, too large, ...); the message is for the user. */
public class UploadRejectedException extends RuntimeException {

    private final HttpStatus status;

    public UploadRejectedException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
