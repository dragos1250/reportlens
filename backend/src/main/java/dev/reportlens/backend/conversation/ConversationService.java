package dev.reportlens.backend.conversation;

import dev.reportlens.backend.ai.AiDtos;
import dev.reportlens.backend.ai.AiServiceClient;
import dev.reportlens.backend.ai.PdfSink;
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
    private static final TypeReference<List<AiDtos.Passage>> PASSAGES = new TypeReference<>() {
    };

    /** Stored as the question of an "Explain this" turn, which has no typed question. */
    static final String EXPLAIN_THIS = "Explain this";

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
        return start(docId, null, title);
    }

    /** With compareDocId, every question in the conversation compares the two reports. */
    public Conversation start(String docId, String compareDocId, String title) {
        // By id, not from the list: uploaded reports are unlisted.
        for (String id : compareDocId == null ? List.of(docId) : List.of(docId, compareDocId)) {
            if (ai.document(id).isEmpty()) {
                throw new NotFoundException("unknown document: " + id);
            }
        }
        if (docId.equals(compareDocId)) {
            throw new InvalidRequestException("compare needs two different documents");
        }
        return conversations.save(new Conversation(docId, compareDocId, title));
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
        return ask(conversationId, question, lang, null);
    }

    /**
     * With a selection, the AI service explains that text only ("Explain this", no question)
     * or answers the question from it ("Ask about this"); no search is involved.
     */
    public Message ask(UUID conversationId, String question, String lang, Selection selection) {
        if (selection != null) {
            return explain(find(conversationId), question, lang, selection);
        }
        Conversation conversation = find(conversationId);
        if (conversation.getCompareDocId() != null) {
            return compare(conversation, question, lang);
        }
        messages.save(Message.question(conversation, question, lang));
        AiDtos.AskResponse response = ai.ask(new AiDtos.AskRequest(question, conversation.getDocId(), lang));
        BigDecimal cost = response.costUsd() == null ? null : BigDecimal.valueOf(response.costUsd());
        // Keep the [P#] markers: with the passages, the UI knows which page each citation is.
        String answer = response.answerMarked() != null ? response.answerMarked() : response.answer();
        return messages.save(Message.answer(conversation, lang, answer, response.status(),
                json.writeValueAsString(response.citations()), json.writeValueAsString(response.passages()),
                cost, response.model()));
    }

    /** The answer cites both reports; the status is "partial" when only one covers the question. */
    private Message compare(Conversation conversation, String question, String lang) {
        messages.save(Message.question(conversation, question, lang));
        AiDtos.CompareResponse response = ai.compare(new AiDtos.CompareRequest(question, conversation.docIds(), lang));
        BigDecimal cost = response.costUsd() == null ? null : BigDecimal.valueOf(response.costUsd());
        String answer = response.answerMarked() != null ? response.answerMarked() : response.answer();
        return messages.save(Message.answer(conversation, lang, answer, response.status(),
                json.writeValueAsString(response.citations()), json.writeValueAsString(response.passages()),
                cost, response.model()));
    }

    private Message explain(Conversation conversation, String question, String lang, Selection selection) {
        String docId = selection.docId() == null ? conversation.getDocId() : selection.docId();
        if (!conversation.docIds().contains(docId)) {
            throw new InvalidRequestException("the selection is not from a document of this conversation");
        }
        String asked = question == null || question.isBlank() ? null : question.strip();
        messages.save(Message.question(conversation, asked != null ? asked : EXPLAIN_THIS, lang)
                .withSelection(new Selection(docId, selection.page(), selection.text())));
        AiDtos.ExplainResponse response = ai.explain(new AiDtos.ExplainRequest(
                docId, selection.page(), selection.text(), asked, lang));
        BigDecimal cost = response.costUsd() == null ? null : BigDecimal.valueOf(response.costUsd());
        return messages.save(Message.answer(conversation, lang, response.answer(), response.status(),
                        json.writeValueAsString(List.of()), json.writeValueAsString(List.of()), cost, response.model())
                .withSelection(new Selection(docId, response.page(), response.quote())));
    }

    public List<AiDtos.Citation> citations(Message message) {
        return message.getCitations() == null ? List.of() : json.readValue(message.getCitations(), CITATIONS);
    }

    public List<AiDtos.Passage> passages(Message message) {
        return message.getPassages() == null ? List.of() : json.readValue(message.getPassages(), PASSAGES);
    }

    public void streamPdf(String docId, String range, PdfSink sink) {
        ai.streamPdf(docId, range, sink);
    }

    private Conversation find(UUID id) {
        return conversations.findById(id).orElseThrow(() -> new NotFoundException("unknown conversation: " + id));
    }
}
