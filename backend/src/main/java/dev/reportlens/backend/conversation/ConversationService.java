package dev.reportlens.backend.conversation;

import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.ai.AiServiceClient;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
public class ConversationService {

    private static final TypeReference<List<AiDtos.Citation>> CITATIONS = new TypeReference<>() {
    };

    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final AiServiceClient ai;
    private final ObjectMapper json;

    public ConversationService(ConversationRepository conversations, MessageRepository messages,
                               AiServiceClient ai, ObjectMapper json) {
        this.conversations = conversations;
        this.messages = messages;
        this.ai = ai;
        this.json = json;
    }

    public List<AiDtos.Document> documents() {
        return ai.documents();
    }

    public Conversation start(String docId, String title) {
        boolean known = ai.documents().stream().anyMatch(d -> d.docId().equals(docId));
        if (!known) {
            throw new NotFoundException("unknown document: " + docId);
        }
        return conversations.save(new Conversation(docId, title));
    }

    public List<Conversation> list() {
        return conversations.findAllByOrderByCreatedAtDesc();
    }

    public List<Message> history(UUID conversationId) {
        find(conversationId);
        return messages.findByConversationIdOrderByIdAsc(conversationId);
    }

    /**
     * Saves the question, asks the AI service, saves the answer. Not one database
     * transaction: the AI call takes seconds and should not hold a connection. If it
     * fails, the question stays in the history without an answer.
     */
    public Message ask(UUID conversationId, String question, String lang) {
        Conversation conversation = find(conversationId);
        messages.save(Message.question(conversation, question, lang));
        AiDtos.AskResponse response = ai.ask(new AiDtos.AskRequest(question, conversation.getDocId(), lang));
        BigDecimal cost = response.costUsd() == null ? null : BigDecimal.valueOf(response.costUsd());
        return messages.save(Message.answer(conversation, lang, response.answer(), response.status(),
                json.writeValueAsString(response.citations()), cost, response.model()));
    }

    public List<AiDtos.Citation> citations(Message message) {
        return message.getCitations() == null ? List.of() : json.readValue(message.getCitations(), CITATIONS);
    }

    private Conversation find(UUID id) {
        return conversations.findById(id).orElseThrow(() -> new NotFoundException("unknown conversation: " + id));
    }
}
