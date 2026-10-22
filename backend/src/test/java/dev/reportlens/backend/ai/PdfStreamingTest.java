package dev.reportlens.backend.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.ConnectException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;

/** Who stopped a PDF transfer: the browser, the AI service, or something unexpected. */
@ExtendWith(OutputCaptureExtension.class)
class PdfStreamingTest {

    private static final byte[] PDF = "%PDF-1.7 some bytes of a report".getBytes(StandardCharsets.US_ASCII);

    /** Tomcat's exception for a browser that disconnected, matched by its simple name. */
    static class ClientAbortException extends IOException {
        ClientAbortException(Throwable cause) {
            super(cause);
        }
    }

    /** A browser connection whose writes fail with the given error. */
    private static OutputStream failingBrowser(IOException error) {
        return new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw error;
            }

            @Override
            public void write(byte[] b, int off, int len) throws IOException {
                throw error;
            }
        };
    }

    /** An AI service response that sends a few bytes and then breaks. */
    private static InputStream upstreamThatBreaks() {
        return new InputStream() {
            private int sent;

            @Override
            public int read() throws IOException {
                if (sent < 5) {
                    return PDF[sent++];
                }
                throw new IOException("Connection reset by peer");
            }
        };
    }

    @Test
    void browserLeavingIsNotAnError(CapturedOutput output) {
        assertThatCode(() -> AiServiceClient.copy("d", new ByteArrayInputStream(PDF),
                failingBrowser(new IOException("Connection reset by peer")))).doesNotThrowAnyException();
        assertThatCode(() -> AiServiceClient.copy("d", new ByteArrayInputStream(PDF),
                failingBrowser(new IOException("Broken pipe")))).doesNotThrowAnyException();
        assertThatCode(() -> AiServiceClient.copy("d", new ByteArrayInputStream(PDF),
                failingBrowser(new ClientAbortException(new IOException("An established connection was aborted")))))
                .doesNotThrowAnyException();

        assertThat(output).doesNotContain("ERROR").doesNotContain("WARN"); // DEBUG is off by default
    }

    @Test
    void otherWriteErrorsAreNotHidden() {
        assertThatThrownBy(() -> AiServiceClient.copy("d", new ByteArrayInputStream(PDF),
                failingBrowser(new IOException("No space left on device"))))
                .isInstanceOf(UncheckedIOException.class);
    }

    @Test
    void aiServiceStoppingMidTransferIsOneWarnLineWithoutStackTrace(CapturedOutput output) {
        var browser = new ByteArrayOutputStream();

        assertThatCode(() -> AiServiceClient.copy("vodafone-20f-fy26", upstreamThatBreaks(), browser))
                .doesNotThrowAnyException();

        assertThat(browser.toByteArray()).hasSize(5); // what arrived before the break was passed on
        assertThat(output).contains("WARN").contains("AI service stopped while streaming the PDF of vodafone-20f-fy26");
        assertThat(output).doesNotContain("\tat "); // no stack trace
    }

    @Test
    void aiServiceStoppingMidTransferThroughTheClient(CapturedOutput output) {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://ai.test");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/documents/d/pdf"))
                .andRespond(request -> new MockClientHttpResponse(upstreamThatBreaks(), HttpStatus.OK));
        var browser = new ByteArrayOutputStream();

        new AiServiceClient(builder.build()).streamPdf("d", null, (status, headers) -> browser);

        assertThat(browser.toByteArray()).hasSize(5);
        assertThat(output).contains("AI service stopped while streaming the PDF of d");
    }

    @Test
    void aiServiceUnreachableBeforeAnyByteIsA502() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://ai.test");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/documents/d/pdf")).andRespond(request -> {
            throw new ConnectException("Connection refused");
        });

        assertThatThrownBy(() -> new AiServiceClient(builder.build())
                .streamPdf("d", null, (status, headers) -> new ByteArrayOutputStream()))
                .isInstanceOf(AiServiceException.class)
                .hasMessage("could not get the PDF");
    }

    @Test
    void recognisesOnlyDisconnects() {
        assertThat(AiServiceClient.isClientGone(new IOException("Connection reset by peer"))).isTrue();
        assertThat(AiServiceClient.isClientGone(new IOException("Broken pipe"))).isTrue();
        assertThat(AiServiceClient.isClientGone(new ClientAbortException(null))).isTrue();
        assertThat(AiServiceClient.isClientGone(new RuntimeException(new IOException("connection reset")))).isTrue();
        assertThat(AiServiceClient.isClientGone(new IOException("No space left on device"))).isFalse();
        assertThat(AiServiceClient.isClientGone(new IOException((String) null))).isFalse();
    }
}
