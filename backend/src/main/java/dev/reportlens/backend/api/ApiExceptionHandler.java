package dev.reportlens.backend.api;

import dev.reportlens.backend.ai.AiServiceException;
import dev.reportlens.backend.conversation.InvalidRequestException;
import dev.reportlens.backend.conversation.NotFoundException;
import dev.reportlens.backend.limits.LimitExceededException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Maps domain errors to RFC 9457 problem details; validation errors use Spring's defaults (400). */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(InvalidRequestException.class)
    ProblemDetail invalid(InvalidRequestException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    /** 429 with Retry-After (seconds), so a client knows when to ask again. */
    @ExceptionHandler(LimitExceededException.class)
    ResponseEntity<ProblemDetail> limited(LimitExceededException e) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()))
                .body(ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, e.getMessage()));
    }

    @ExceptionHandler(AiServiceException.class)
    ProblemDetail aiUnavailable(AiServiceException e) {
        // No cause details in the response: they can contain internal URLs.
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, "AI service error: " + e.getMessage());
    }
}
