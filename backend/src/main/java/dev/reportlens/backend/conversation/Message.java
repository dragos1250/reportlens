package dev.reportlens.backend.conversation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** One turn of a conversation: the user's question or the assistant's answer. */
@Entity
@Table(name = "messages")
public class Message {

    public static final String USER = "user";
    public static final String ASSISTANT = "assistant";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id")
    private Conversation conversation;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    private String content;

    private String lang;

    private String status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String citations;  // JSON array, written and read by ConversationService

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String passages;  // JSON array of every passage sent to the model, cited or not

    @Column(name = "cost_usd")
    private BigDecimal costUsd;

    private String model;

    @Column(name = "selection_page")
    private Integer selectionPage;

    @Column(name = "selection_text")
    private String selectionText;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Message() {  // for JPA
    }

    private Message(Conversation conversation, String role, String content, String lang) {
        this.conversation = conversation;
        this.role = role;
        this.content = content;
        this.lang = lang;
        this.createdAt = OffsetDateTime.now();
    }

    public static Message question(Conversation conversation, String question, String lang) {
        return new Message(conversation, USER, question, lang);
    }

    /** {@code answer} keeps the [P1].. markers; {@code passagesJson} says which page each marker is. */
    public static Message answer(Conversation conversation, String lang, String answer, String status,
                                 String citationsJson, String passagesJson, BigDecimal costUsd, String model) {
        var message = new Message(conversation, ASSISTANT, answer, lang);
        message.status = status;
        message.citations = citationsJson;
        message.passages = passagesJson;
        message.costUsd = costUsd;
        message.model = model;
        return message;
    }

    /** Marks this message as part of a Select & explain turn. */
    public Message withSelection(Selection selection) {
        if (selection != null) {
            this.selectionPage = selection.page();
            this.selectionText = selection.text();
        }
        return this;
    }

    public Selection getSelection() {
        return selectionPage == null ? null : new Selection(selectionPage, selectionText);
    }

    public Long getId() {
        return id;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getLang() {
        return lang;
    }

    public String getStatus() {
        return status;
    }

    public String getCitations() {
        return citations;
    }

    public String getPassages() {
        return passages;
    }

    public BigDecimal getCostUsd() {
        return costUsd;
    }

    public String getModel() {
        return model;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
