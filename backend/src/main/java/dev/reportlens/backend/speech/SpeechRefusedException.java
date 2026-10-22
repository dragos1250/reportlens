package dev.reportlens.backend.speech;

import org.springframework.http.HttpStatus;

/** The premium voice cannot read this answer; the browser voice still can. The message is for the user. */
public class SpeechRefusedException extends RuntimeException {

    private final HttpStatus status;

    public SpeechRefusedException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
