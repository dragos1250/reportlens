package dev.reportlens.backend.api;

import dev.reportlens.backend.api.ApiDtos.AskQuestion;
import dev.reportlens.backend.api.ApiDtos.CitationDto;
import dev.reportlens.backend.api.ApiDtos.ConversationDto;
import dev.reportlens.backend.api.ApiDtos.DocumentDto;
import dev.reportlens.backend.api.ApiDtos.MessageDto;
import dev.reportlens.backend.api.ApiDtos.StartConversation;
import dev.reportlens.backend.conversation.Conversation;
import dev.reportlens.backend.conversation.ConversationService;
import dev.reportlens.backend.conversation.Message;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final ConversationService service;

    public ApiController(ConversationService service) {
        this.service = service;
    }

    @GetMapping("/documents")
    public List<DocumentDto> documents() {
        return service.documents().stream().map(d -> new DocumentDto(d.docId(), d.title(), d.chunks())).toList();
    }

    @PostMapping("/conversations")
    public ResponseEntity<ConversationDto> start(@Valid @RequestBody StartConversation request) {
        Conversation conversation = service.start(request.docId(), request.title());
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

    /** Asks a question in a conversation; returns the assistant's answer (201). */
    @PostMapping("/conversations/{id}/messages")
    public ResponseEntity<MessageDto> ask(@PathVariable UUID id, @Valid @RequestBody AskQuestion request) {
        Message answer = service.ask(id, request.question(), request.lang());
        return ResponseEntity.created(URI.create("/api/conversations/" + id + "/messages")).body(toDto(answer));
    }

    private static ConversationDto toDto(Conversation c) {
        return new ConversationDto(c.getId(), c.getDocId(), c.getTitle(), c.getCreatedAt());
    }

    private MessageDto toDto(Message m) {
        List<CitationDto> citations = service.citations(m).stream()
                .map(c -> new CitationDto(c.marker(), c.docId(), c.page(), c.chunkId())).toList();
        return new MessageDto(m.getId(), m.getRole(), m.getContent(), m.getLang(), m.getStatus(), citations,
                m.getCostUsd(), m.getModel(), m.getCreatedAt());
    }
}
