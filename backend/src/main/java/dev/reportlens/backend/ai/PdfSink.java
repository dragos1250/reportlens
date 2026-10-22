package dev.reportlens.backend.ai;

import org.springframework.http.HttpHeaders;

import java.io.IOException;
import java.io.OutputStream;

/** Where a streamed PDF goes: first the status and headers, then the bytes. */
public interface PdfSink {

    OutputStream start(int status, HttpHeaders headers) throws IOException;
}
