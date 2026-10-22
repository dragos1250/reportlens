package dev.reportlens.backend.conversation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "conversations")
public class Conversation {

    @Id
    private UUID id;

    @Column(name = "doc_id", nullable = false)
    private String docId;

    /** The second report when this conversation compares two; null otherwise. */
    @Column(name = "compare_doc_id")
    private String compareDocId;

    private String title;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Conversation() {  // for JPA
    }

    public Conversation(String docId, String title) {
        this(docId, null, title);
    }

    public Conversation(String docId, String compareDocId, String title) {
        this.id = UUID.randomUUID();  // generated here, so the id is known before saving
        this.docId = docId;
        this.compareDocId = compareDocId;
        this.title = title;
        this.createdAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public String getDocId() {
        return docId;
    }

    public String getCompareDocId() {
        return compareDocId;
    }

    /** The documents this conversation is about: one, or two when comparing. */
    public List<String> docIds() {
        return compareDocId == null ? List.of(docId) : List.of(docId, compareDocId);
    }

    public String getTitle() {
        return title;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
