package dev.reportlens.backend.api;

import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.api.ApiDtos.AskQuestion;
import dev.reportlens.backend.api.ApiDtos.CitationDto;
import dev.reportlens.backend.api.ApiDtos.ConversationDto;
import dev.reportlens.backend.api.ApiDtos.DocumentDto;
import dev.reportlens.backend.api.ApiDtos.MessageDto;
import dev.reportlens.backend.api.ApiDtos.PassageDto;
import dev.reportlens.backend.api.ApiDtos.SelectionDto;
import dev.reportlens.backend.api.ApiDtos.StartConversation;
import dev.reportlens.backend.conversation.Conversation;
import dev.reportlens.backend.conversation.ConversationService;
import dev.reportlens.backend.conversation.Message;
import dev.reportlens.backend.conversation.Selection;
import dev.reportlens.backend.limits.UsageLimits;
import dev.reportlens.backend.speech.SpeechProperties;
import dev.reportlens.backend.speech.SpokenText;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final ConversationService service;
    private final int speechChars;
    private final UsageLimits limits;

    public ApiController(ConversationService service, UsageLimits limits, SpeechProperties speech) {
        this.service = service;
        this.limits = limits;
        this.speechChars = speech.maxChars();
    }

    @GetMapping("/documents")
    public List<DocumentDto> documents() {
        return service.documents().stream().map(ApiController::toDto).toList();
    }

    /**
     * The report PDF, streamed from the AI service: bytes are copied as they arrive, never
     * held in memory. Range requests are passed through (206), so pdf.js loads only the
     * parts of a 32 MB file it needs.
     */
    @GetMapping("/documents/{docId}/pdf")
    public void pdf(@PathVariable String docId, @RequestHeader(value = HttpHeaders.RANGE, required = false) String range,
                    HttpServletResponse response) {
        service.streamPdf(docId, range, (status, headers) -> {
            response.setStatus(status);
            headers.forEach((name, values) -> values.forEach(value -> response.addHeader(name, value)));
            return response.getOutputStream();
        });
    }

    @PostMapping("/conversations")
    public ResponseEntity<ConversationDto> start(@Valid @RequestBody StartConversation request) {
        Conversation conversation = service.start(request.docId(), request.compareDocId(), request.title());
        return ResponseEntity.created(URI.create("/api/conversations/" + conversation.getId()))
                .body(toDto(conversation));
    }

    @GetMapping("/conversations")
    public List<ConversationDto> conversations() {
        return service.list().stream().map(ApiController::toDto).toList();
    }

    @GetMapping("/conversations/{id}/messages")
    public List<MessageDto> history(@PathVariable UUID id) {
        return service.history(id).stream().map(this::toDto).toList();
    }

    /**
     * Asks a question in a conversation; returns the assistant's answer (201). The usage
     * limits are checked first (429 before any LLM call), and the answer's cost is counted.
     */
    @PostMapping("/conversations/{id}/messages")
    public ResponseEntity<MessageDto> ask(@PathVariable UUID id, @Valid @RequestBody AskQuestion request,
                                          HttpServletRequest http) {
        String ip = limits.clientIp(http.getRemoteAddr(), http.getHeader("X-Forwarded-For"));
        limits.check(ip);
        Selection selection = request.selection() == null ? null
                : new Selection(request.selection().docId(), request.selection().page(), request.selection().text());
        Message answer = service.ask(id, request.question(), request.lang(), selection);
        limits.record(ip, answer.getCostUsd());
        return ResponseEntity.created(URI.create("/api/conversations/" + id + "/messages")).body(toDto(answer));
    }

    static DocumentDto toDto(AiDtos.Document d) {
        return new DocumentDto(d.docId(), d.title(), d.chunks(), d.source(),
                d.pages(), d.pagesWithoutText(), d.expiresAt());
    }

    private static ConversationDto toDto(Conversation c) {
        return new ConversationDto(c.getId(), c.getDocId(), c.getCompareDocId(), c.getTitle(), c.getCreatedAt());
    }

    private MessageDto toDto(Message m) {
        List<CitationDto> citations = service.citations(m).stream()
                .map(c -> new CitationDto(c.marker(), c.docId(), c.page(), c.chunkId())).toList();
        List<PassageDto> passages = service.passages(m).stream()
                .map(p -> new PassageDto(p.marker(), p.docId(), p.page(), p.chunkId(), p.text(), p.cited())).toList();
        Selection s = m.getSelection();
        String spoken = "assistant".equals(m.getRole()) ? SpokenText.of(m.getContent(), speechChars) : null;
        return new MessageDto(m.getId(), m.getRole(), m.getContent(), m.getLang(), m.getStatus(), citations,
                passages, m.getCostUsd(), m.getModel(), s == null ? null : new SelectionDto(s.docId(), s.page(), s.text()),
                m.getCreatedAt(), spoken, spoken == null ? null : SpokenText.languageOf(m.getLang(), spoken));
    }
}
