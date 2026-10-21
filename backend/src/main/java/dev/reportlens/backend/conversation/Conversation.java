package dev.reportlens.backend.conversation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "conversations")
public class Conversation {

    @Id
    private UUID id;

    @Column(name = "doc_id", nullable = false)
    private String docId;

    private String title;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Conversation() {  // for JPA
    }

    public Conversation(String docId, String title) {
        this.id = UUID.randomUUID();  // generated here, so the id is known before saving
        this.docId = docId;
        this.title = title;
        this.createdAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public String getDocId() {
        return docId;
    }

    public String getTitle() {
        return title;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
